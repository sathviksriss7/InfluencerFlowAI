from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS # Import CORS
from dotenv import load_dotenv
import os
import signal
import requests
import json
from functools import wraps # For decorator
from supabase import create_client, Client # Supabase client
from datetime import datetime, timedelta

# Import Twilio and ElevenLabs
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Say, Play, Record, Gather
from elevenlabs.client import ElevenLabs # type: ignore # Use this for the main client
import shutil # For saving audio file temporarily
import uuid   # For generating unique filenames
import urllib.request # For downloading the recording

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Configure CORS
# For development, allow your frontend's localhost. 
# For production, add your specific Vercel frontend URL(s).
CORS(app, resources={r"/api/*": {"origins": [
    "http://localhost:5173", # For local frontend development
    os.getenv("VITE_FRONTEND_URL", "https://your-vercel-frontend-url.vercel.app") # Use an env var for Vercel URL
    # You can add more specific preview URLs if needed, e.g., "https://*.vercel.app"
]}})

# Get API keys and Supabase client from environment variables
supabase_url = os.getenv("VITE_SUPABASE_URL")
supabase_key = os.getenv("VITE_SUPABASE_ANON_KEY") 
supabase_service_key = os.getenv("VITE_SUPABASE_SERVICE_KEY") # New
groq_api_key = os.getenv("VITE_GROQ_API_KEY")

# Twilio Credentials
twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID")
twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN")
twilio_phone_number = os.getenv("TWILIO_PHONE_NUMBER") # Your Twilio phone number

# ElevenLabs Credentials
elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
elevenlabs_voice_id = os.getenv("ELEVENLABS_VOICE_ID", "Rachel") # Default if not set

# Initialize Supabase Clients
supabase_client: Client | None = None # For user-context operations (e.g., token validation)
supabase_admin_client: Client | None = None # For privileged backend operations (e.g., storage writes)

if supabase_url and supabase_key:
    supabase_client = create_client(supabase_url, supabase_key)
    print("✅ Supabase Client (anon key) Initialized.")
else:
    print("🔴 CRITICAL: Supabase URL or Anon Key not found. User token validation will fail.")

if supabase_url and supabase_service_key:
    try:
        supabase_admin_client = create_client(supabase_url, supabase_service_key)
        print("✅ Supabase Admin Client (service role key) Initialized Successfully.")
    except Exception as e:
        print(f"❌ Error initializing Supabase Admin Client: {e}. Storage uploads might fail.")
else:
    print("🔴 WARNING: Supabase Service Key (VITE_SUPABASE_SERVICE_KEY) not found in .env. Storage uploads requiring admin rights will fail.")

# Initialize Twilio Client
if not twilio_account_sid or not twilio_auth_token or not twilio_phone_number:
    print("🔴 WARNING: Twilio credentials not fully configured. Voice call features will fail.")
    twilio_client = None
else:
    try:
        twilio_client = TwilioClient(twilio_account_sid, twilio_auth_token)
        print("✅ Twilio Client Initialized Successfully.")
    except Exception as e:
        print(f"❌ Error initializing Twilio Client: {e}")
        twilio_client = None

# Initialize ElevenLabs Client
if not elevenlabs_api_key:
    print("🔴 WARNING: ElevenLabs API key not configured. AI TTS will use Twilio's basic TTS.")
    elevenlabs_client = None
else:
    try:
        elevenlabs_client = ElevenLabs(api_key=elevenlabs_api_key)
        print("✅ ElevenLabs Client Initialized Successfully.")
    except Exception as e:
        print(f"❌ Error initializing ElevenLabs Client: {e}")
        elevenlabs_client = None

# Ensure a temporary directory for audio files exists
TEMP_AUDIO_DIR = os.path.join(app.root_path, 'temp_audio')
if not os.path.exists(TEMP_AUDIO_DIR):
    os.makedirs(TEMP_AUDIO_DIR)

# Simple in-memory store for recent transcripts (NOT for production - use a DB for persistence)
# Key: outreach_id, Value: list of recent transcript texts
recent_transcripts_store = {}
MAX_TRANSCRIPTS_PER_OUTREACH = 3 # Store last 3 transcripts for context

# Simple in-memory store for call artifacts (NOT for production - use a DB for persistence)
# Key: call_sid, Value: { recording_url: str, transcript: str, duration: str, outreach_id: str }
call_artifacts_store = {}

# --- JWT Authentication Decorator ---
def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Allow OPTIONS requests to pass through without token validation (for CORS preflight)
        if request.method == 'OPTIONS':
            # Return a simple 200 OK response for OPTIONS.
            # Flask-CORS will add the necessary Access-Control-Allow-* headers.
            response = app.make_response(jsonify(message="OPTIONS request successful"))
            response.status_code = 200
            # Flask-CORS should automatically add headers like 'Access-Control-Allow-Origin',
            # 'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers' based on your CORS setup.
            return response

        token = None
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            try:
                token = auth_header.split(" ")[1] # Bearer <token>
            except IndexError:
                return jsonify({"success": False, "error": "Malformed Authorization header"}), 401

        if not token:
            return jsonify({"success": False, "error": "Authorization token is missing"}), 401

        if not supabase_client:
            return jsonify({"success": False, "error": "Supabase client not initialized on backend for token validation."}), 500

        try:
            # Validate the token using Supabase
            user_response = supabase_client.auth.get_user(token)
            # If get_user doesn't throw an error and returns a user, the token is valid.
            # user_response.user will contain user details if needed by the endpoint.
            print(f"🔑 Token validated for user: {user_response.user.id if user_response and user_response.user else 'Unknown'}")
            request.current_user = user_response.user # Make user available to endpoint
        except Exception as e:
            print(f"❌ Token validation error: {e}")
            return jsonify({"success": False, "error": f"Invalid or expired token: {e}"}), 401
        
        return f(*args, **kwargs)
    return decorated_function

# --- Helper: Build Stage-Aware Negotiation Prompt (Python version) ---
def build_stage_aware_negotiation_prompt(outreach_data):
    # Basic details (ensure keys match what frontend sends)
    creator_name = outreach_data.get('creatorName', 'N/A')
    creator_platform = outreach_data.get('creatorPlatform', 'N/A')
    current_status = outreach_data.get('status', 'N/A')
    confidence_score = outreach_data.get('confidence', 0)
    brand_name = outreach_data.get('brandName', 'N/A')
    campaign_context_summary = outreach_data.get('campaignContext', 'N/A')[:150] # Summary
    current_offer_raw = outreach_data.get('currentOffer')
    current_offer_str = f"₹{current_offer_raw}" if current_offer_raw else 'Not set'
    
    # Get email conversation history summary from the payload (as before)
    email_conversation_summary = outreach_data.get('conversationHistorySummary', "No previous email conversation.")
    
    # Get recent call transcripts from our in-memory store
    call_transcripts = recent_transcripts_store.get(outreach_data.get('id', 'unknown_outreach'), [])
    call_transcript_summary = "\n".join(call_transcripts) if call_transcripts else "No recent call transcripts available."

    has_email_history = bool(email_conversation_summary and email_conversation_summary != "No previous email conversation.")
    has_call_history = bool(call_transcript_summary and call_transcript_summary != "No recent call transcripts available.")

    combined_history_section = ""
    if has_email_history and has_call_history:
        combined_history_section = f"""CONVERSATION HISTORY (Emails & Calls):
Email Summary:
{email_conversation_summary}

Recent Call Transcript Snippets:
{call_transcript_summary}

IMPORTANT: Based on ALL conversation history above..."""
    elif has_email_history:
        combined_history_section = f"""EMAIL CONVERSATION HISTORY:
{email_conversation_summary}

IMPORTANT: Based on the email conversation history above..."""
    elif has_call_history:
        combined_history_section = f"""RECENT CALL TRANSCRIPT SNIPPETS:
{call_transcript_summary}

IMPORTANT: Based on the call transcript history above..."""
    else:
        combined_history_section = "INITIAL OUTREACH CONTEXT: This is the beginning of the negotiation conversation."

    # Simplified stage-specific guidance (we can expand this)
    stage_guidance = ""
    if current_status == 'interested':
        stage_guidance = "INTERESTED STAGE: Focus on building excitement and presenting value."
    elif current_status == 'negotiating':
        stage_guidance = "NEGOTIATING STAGE: Address concerns and find win-win solutions."
    else:
        stage_guidance = "GENERAL STAGE: Maintain professional and positive tone."

    prompt = f"""You are an expert negotiation agent for influencer marketing deals. Provide strategic negotiation guidance based on the current stage, context, and conversation history.

OUTREACH CONTEXT:
- Creator: {creator_name} (@{creator_platform})
- Current Status: {current_status}
- Confidence Score: {confidence_score}%
- Brand: {brand_name}
- Campaign: {campaign_context_summary}...
- Current Offer: {current_offer_str}

{combined_history_section}

STAGE-SPECIFIC GUIDANCE:
{stage_guidance}

NEGOTIATION REQUIREMENTS:
1. Analyze the current negotiation stage.
2. { "Continue the conversation naturally based on previous exchanges" if (has_email_history or has_call_history) else "Provide a personalized response that starts the negotiation conversation"}
3. Recommend negotiation tactics.
4. Suggest an appropriate offer amount with reasoning.
5. Outline clear next steps.

RESPONSE TONE:
- Professional, warm, and personal.
- Acknowledge previous points if applicable.
- Show genuine interest in partnership.
- Be specific and action-oriented.

Response format (JSON only):
{{
  "currentPhase": "initial_interest" | "price_discussion" | "terms_negotiation" | "closing",
  "suggestedResponse": "Personalized message for the creator.",
  "negotiationTactics": ["tactic 1", "tactic 2"],
  "recommendedOffer": {{ "amount": number, "reasoning": "Strategic reasoning." }},
  "nextSteps": ["actionable step 1", "actionable step 2"]
}}
Ensure the entire response is a single, valid JSON object with no extra text, and all strings are properly quoted and elements correctly comma-separated.
Focus on building genuine relationships and creating mutually beneficial partnerships. The message should read naturally and professionally without any system-generated metadata."""
    return prompt

# --- Helper: Generate Fallback Strategy (Python version) ---
def generate_advanced_fallback_strategy(outreach_data):
    creator_name = outreach_data.get('creatorName', 'Creator')
    brand_name = outreach_data.get('brandName', 'our brand')
    base_offer = outreach_data.get('currentOffer', 10000) or 10000

    # Simplified fallback, can be expanded based on outreach_data['status']
    return {
        "currentPhase": "initial_interest",
        "suggestedResponse": f"Hi {creator_name}! Thanks for your interest in {brand_name}. Let's discuss a collaboration!",
        "negotiationTactics": ["Build rapport", "Emphasize mutual value"],
        "recommendedOffer": {"amount": round(base_offer * 1.1), "reasoning": "Algorithmic suggestion based on initial offer/base value."},
        "nextSteps": ["Schedule a call", "Prepare campaign brief"]
    }

@app.route('/api/negotiation/generate-strategy', methods=['POST'])
@token_required # Apply the JWT authentication decorator
def handle_generate_negotiation_strategy():
    if not groq_api_key:
        return jsonify({"success": False, "error": "Groq API key not configured on backend.", "method": "algorithmic_fallback", "insight": generate_advanced_fallback_strategy(request.json)}), 500

    outreach_data = request.json
    if not outreach_data:
        return jsonify({"success": False, "error": "Missing outreach data in request body."}), 400

    prompt = build_stage_aware_negotiation_prompt(outreach_data)
    
    try:
        headers = {
            "Authorization": f"Bearer {groq_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama3-70b-8192", # Or your preferred Groq model
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 1500
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status() # Raise an exception for HTTP errors
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data['choices'][0]['message']['content']
        
        # Attempt to parse the AI's JSON response string
        try:
            # Try to find the JSON block within the AI's response
            # This looks for the first '{' and the last '}'
            json_start_index = ai_message_content.find('{')
            json_end_index = ai_message_content.rfind('}')

            if json_start_index != -1 and json_end_index != -1 and json_start_index < json_end_index:
                json_str = ai_message_content[json_start_index : json_end_index + 1]
                insights = json.loads(json_str)
                # Basic validation of the parsed insights
                if not all(k in insights for k in ["currentPhase", "suggestedResponse", "recommendedOffer"]):
                    raise ValueError("AI response JSON missing required keys")
                return jsonify({"success": True, "insight": insights, "method": "ai_generated"})
            else:
                raise ValueError("Could not find valid JSON block in AI response.")
                
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing or validating AI JSON response: {e}")
            print(f"Raw AI response content that caused parsing/validation error: {ai_message_content}")
            # Fallback if AI response is not valid JSON or misses keys
            return jsonify({"success": True, "insight": generate_advanced_fallback_strategy(outreach_data), "method": "algorithmic_fallback", "error": "AI response parsing/validation failed, using fallback."})

    except requests.exceptions.RequestException as e:
        print(f"Groq API request failed: {e}")
        return jsonify({"success": True, "insight": generate_advanced_fallback_strategy(outreach_data), "method": "algorithmic_fallback", "error": str(e)})
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"success": True, "insight": generate_advanced_fallback_strategy(outreach_data), "method": "algorithmic_fallback", "error": "An unexpected error occurred on the backend."})

@app.route('/api/hello', methods=['GET'])
def hello_world():
    return jsonify({
        "message": "Hello from the InfluencerFlowAI Python Backend!",
        "supabase_url_loaded": bool(supabase_url),
        "groq_api_key_loaded": bool(groq_api_key)
    })

# --- Helper: Build Personalized Outreach Prompt (Python version) ---
def build_personalized_outreach_prompt(campaign_data, creator_match_data, requirements_data):
    campaign_title = campaign_data.get('title', '[Campaign Title]')
    campaign_brand = campaign_data.get('brand', '[Brand Name]')
    product_service = requirements_data.get('productService', '[Product/Service]')
    campaign_objective = requirements_data.get('campaignObjective', '[Campaign Objective]')
    budget_min = campaign_data.get('budgetMin', 0)
    budget_max = campaign_data.get('budgetMax', 0)
    key_message = requirements_data.get('keyMessage', '[Key Message]')

    creator_name = creator_match_data.get('creator', {}).get('name', '[Creator Name]')
    creator_platform = creator_match_data.get('creator', {}).get('platform', '[Platform]')
    creator_followers = creator_match_data.get('creator', {}).get('metrics', {}).get('followers', 0)
    creator_niches = ", ".join(creator_match_data.get('creator', {}).get('niche', []))
    creator_reasoning = creator_match_data.get('reasoning', '[Reasoning for fit]')

    prompt = f"""Generate a personalized, professional outreach email for an influencer collaboration.

CAMPAIGN DETAILS:
Company: {campaign_brand}
Product/Service: {product_service}
Campaign: {campaign_title}
Objective: {campaign_objective}
Budget Range: ₹{budget_min}-₹{budget_max}
Key Message: {key_message}

CREATOR DETAILS:
Name: {creator_name}
Platform: {creator_platform}
Followers: {creator_followers:,}
Niches: {creator_niches}
Why they're a good fit: {creator_reasoning}

EMAIL REQUIREMENTS:
- Professional but friendly and engaging tone.
- Clearly state why this specific creator is being contacted, referencing their content or niche.
- Briefly introduce the brand and the campaign's value proposition for the creator and their audience.
- Suggest clear next steps for discussion (e.g., a quick call, sending more details).
- Keep it concise (ideally 2-3 short paragraphs).
- Include a strong, clear call-to-action.

Response format (JSON only):
{{
  "subject": "Partnership Opportunity: [Craft a compelling, personalized subject line, e.g., {campaign_brand} x {creator_name} for {campaign_title}]",
  "message": "[Your professionally crafted, personalized email content here. Use placeholders like [Creator Name] if needed, which will be replaced.]"
}}

Make it authentic and avoid overly generic or spammy language. The goal is to genuinely connect and start a positive conversation."""
    return prompt

# --- Helper: Generate Template Outreach (Python version) ---
def generate_template_outreach_py(campaign_data, creator_match_data, requirements_data):
    campaign_brand = campaign_data.get('brand', '[Brand Name]')
    creator_name = creator_match_data.get('creator', {}).get('name', '[Creator Name]')
    creator_platform = creator_match_data.get('creator', {}).get('platform', '[Platform]')
    creator_niches_list = creator_match_data.get('creator', {}).get('niche', [])
    creator_niches = " and ".join(creator_niches_list) if creator_niches_list else "[Their Niche]"
    campaign_title = campaign_data.get('title', '[Campaign Title]')
    creator_followers = creator_match_data.get('creator', {}).get('metrics', {}).get('followers', 0)
    product_service = requirements_data.get('productService', '[Product/Service]')
    creator_reasoning = creator_match_data.get('reasoning', 'your unique content and audience fit our campaign goals.')

    subject = f"Partnership Opportunity: {campaign_brand} x {creator_name}"
    message = f"""Hi {creator_name},

I hope this message finds you well! I'm reaching out from {campaign_brand} because we've been following your {creator_platform} content in the {creator_niches} space, and we're genuinely impressed by your engagement and authentic voice.

We're launching our "{campaign_title}" campaign and believe your audience of {creator_followers:,}+ followers would be a perfect fit for our {product_service}. Your content style and focus align perfectly with our campaign objectives.

We'd love to discuss a collaboration that would be mutually beneficial. Our campaign budget allows for competitive compensation, and we're flexible on content format and timing to match your style.

Would you be interested in learning more about this partnership opportunity? I'd be happy to send over more details and discuss how we can work together.

Looking forward to hearing from you!

Best regards,
{campaign_brand} Partnership Team

P.S. We chose you specifically because {creator_reasoning}"""
    return {"subject": subject, "message": message}

@app.route('/api/outreach/generate-message', methods=['POST'])
@token_required # Secure this endpoint
def handle_generate_outreach_message():
    data = request.json
    if not data or not all(k in data for k in ['campaign', 'creatorMatch', 'requirements']):
        return jsonify({"success": False, "error": "Missing required data: campaign, creatorMatch, or requirements."}), 400

    campaign_data = data['campaign']
    creator_match_data = data['creatorMatch']
    requirements_data = data['requirements']
    prefer_ai_generation = requirements_data.get('personalizedOutreach', False)

    if not groq_api_key:
        print("🤖 Outreach Agent (Backend): Groq API key not configured. Using template.")
        template_content = generate_template_outreach_py(campaign_data, creator_match_data, requirements_data)
        return jsonify({"success": True, **template_content, "method": "template_based"})

    # Decide whether to use AI based on preference and API key availability
    use_ai = prefer_ai_generation # We already checked for groq_api_key

    if use_ai:
        prompt = build_personalized_outreach_prompt(campaign_data, creator_match_data, requirements_data)
        try:
            print(f"🤖 Outreach Agent (Backend): Making AI API call for {creator_match_data.get('creator', {}).get('name', 'N/A')}...")
            headers = {
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama3-70b-8192",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4, # Slightly more creative for outreach
                "max_tokens": 800
            }
            
            response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            
            ai_response_data = response.json()
            ai_message_content = ai_response_data['choices'][0]['message']['content']
            
            try:
                json_str = ai_message_content # Default to the full content
                # Attempt to strip markdown fences if present
                if ai_message_content.strip().startswith("```json"):
                    # Find the start of the actual JSON after the ```json
                    json_block_start = ai_message_content.find('{')
                    # Find the end of the JSON before the closing ```
                    json_block_end = ai_message_content.rfind('}')
                    if json_block_start != -1 and json_block_end != -1 and json_block_start < json_block_end:
                        json_str = ai_message_content[json_block_start : json_block_end + 1]
                elif ai_message_content.strip().startswith("{") and ai_message_content.strip().endswith("}"):
                    json_str = ai_message_content.strip() # It's already a JSON string (hopefully)
                else: # If no clear JSON structure, try finding the first { and last }
                    json_start_index = ai_message_content.find('{')
                    json_end_index = ai_message_content.rfind('}')
                    if json_start_index != -1 and json_end_index != -1 and json_start_index < json_end_index:
                        json_str = ai_message_content[json_start_index : json_end_index + 1]
                    else:
                        raise ValueError("Could not find any JSON-like block in AI response.")

                content = json.loads(json_str) 
                
                # Adapt the 'body' field from AI to 'message' for consistent response structure with other endpoints
                if "body" in content and "message" not in content:
                    content["message"] = content.pop("body")

                # Basic validation for expected keys after adaptation
                if not all(k in content for k in ["subject", "message"]):
                    raise ValueError("AI outreach response JSON missing required keys (subject, message) after adaptation")
                
                print(f"✨ Outreach Agent (Backend): AI outreach generated for {creator_match_data.get('creator', {}).get('name', 'N/A')}")
                return jsonify({"success": True, **content, "method": "ai_generated"})
            except (json.JSONDecodeError, ValueError) as e:
                print(f"Error parsing AI outreach JSON response: {e}. Raw: {ai_message_content}")
                # Fallback to template if AI JSON parsing fails
                template_content = generate_template_outreach_py(campaign_data, creator_match_data, requirements_data)
                return jsonify({"success": True, **template_content, "method": "template_based", "error": "AI response parsing failed, using template."})

        except requests.exceptions.RequestException as e:
            print(f"Groq API request failed for outreach: {e}")
            template_content = generate_template_outreach_py(campaign_data, creator_match_data, requirements_data)
            return jsonify({"success": True, **template_content, "method": "template_based", "error": str(e)})
        except Exception as e:
            print(f"An unexpected error occurred during AI outreach generation: {e}")
            template_content = generate_template_outreach_py(campaign_data, creator_match_data, requirements_data)
            return jsonify({"success": True, **template_content, "method": "template_based", "error": "Unexpected backend error during AI outreach."})
    else:
        print(f"📝 Outreach Agent (Backend): Using template for {creator_match_data.get('creator', {}).get('name', 'N/A')}")
        template_content = generate_template_outreach_py(campaign_data, creator_match_data, requirements_data)
        return jsonify({"success": True, **template_content, "method": "template_based"})

# --- Helper: Build Campaign Generation Prompt (Python version) ---
def build_campaign_generation_prompt(requirements_data):
    # Extracting data with defaults to prevent KeyErrors
    company_name = requirements_data.get('companyName', '[Company Name]')
    industry = requirements_data.get('industry', '[Industry]')
    product_service = requirements_data.get('productService', '[Product/Service]')
    business_goals_list = requirements_data.get('businessGoals', [])
    business_goals = ", ".join(business_goals_list) if business_goals_list else '[Business Goals]'
    target_audience = requirements_data.get('targetAudience', '[Target Audience]')
    demographics = requirements_data.get('demographics', '[Demographics]') # Assuming this key might exist
    campaign_objective = requirements_data.get('campaignObjective', '[Campaign Objective]')
    key_message = requirements_data.get('keyMessage', '[Key Message]') # Assuming this key might exist
    budget_min_req = requirements_data.get('budgetRange', {}).get('min', 0)
    budget_max_req = requirements_data.get('budgetRange', {}).get('max', 10000)
    timeline = requirements_data.get('timeline', '[Timeline]')
    preferred_platforms_list = requirements_data.get('preferredPlatforms', [])
    preferred_platforms = ", ".join(preferred_platforms_list) if preferred_platforms_list else 'No preference'
    content_types_list = requirements_data.get('contentTypes', []) # Assuming this key might exist
    content_types = ", ".join(content_types_list) if content_types_list else 'Open to suggestions'
    special_requirements = requirements_data.get('specialRequirements', 'None') # Assuming this key might exist

    # AI-Optimized Budget (example, can be refined)
    budget_min_ai = int(budget_min_req * 0.8)
    budget_max_ai = int(budget_max_req * 0.9)

    prompt = f"""You are an expert campaign strategist with 15+ years of experience in influencer marketing. Generate a comprehensive, data-driven campaign based on business requirements.

BUSINESS REQUIREMENTS ANALYSIS:
Company: {company_name}
Industry: {industry}
Product/Service: {product_service}
Business Goals: {business_goals}
Target Audience: {target_audience}
Demographics: {demographics}
Campaign Objective: {campaign_objective}
Key Message: {key_message}
Budget Range (Requirement): ₹{budget_min_req}-₹{budget_max_req}
Timeline: {timeline}
Preferred Platforms: {preferred_platforms}
Content Types: {content_types}
Special Requirements: {special_requirements}

CAMPAIGN GENERATION REQUIREMENTS:
1. STRATEGIC TITLE: Create compelling campaign title (5-8 words)
2. PLATFORM OPTIMIZATION: Choose 2-4 platforms based on audience and objectives
3. AUDIENCE SIZING: Determine optimal follower count requirements (e.g., 10000+)
4. NICHE TARGETING: Select 2-5 relevant content niches
5. GEO-TARGETING: Choose appropriate locations (default to India if not specified)
6. DELIVERABLE STRATEGY: Design content mix (e.g., Instagram Posts, Stories, Reels)
7. BUDGET OPTIMIZATION: Distribute budget efficiently (provide a range, e.g., budgetMin, budgetMax based on requirement)
8. TIMELINE PLANNING: Set realistic start/end/application deadlines (YYYY-MM-DD format)
9. SUCCESS METRICS & AI INSIGHTS: Define KPIs, success factors, potential challenges, and optimization suggestions.

PLATFORM DECISION MATRIX (Consider these):
- Instagram: Visual products, lifestyle, fashion, food, travel
- YouTube: Educational, tech reviews, detailed demos, storytelling
- TikTok: Gen Z audience, viral content, entertainment, challenges
- LinkedIn: B2B, professional services, thought leadership
- Twitter: News, tech, real-time engagement

Generate response in this EXACT JSON format. Ensure all strings are double-quoted and all values are valid JSON types:
{{
  "title": "Strategic campaign title",
  "brand": "{company_name}",
  "description": "Compelling 2-3 sentence campaign description",
  "brief": "Detailed campaign brief (200-300 words) including objectives, messaging, audience insights, and success metrics",
  "platforms": ["platform1", "platform2"],
  "minFollowers": 10000,
  "niches": ["niche1", "niche2", "niche3"],
  "locations": ["India"], 
  "deliverables": ["Instagram Posts", "Stories"],
  "budgetMin": {budget_min_ai},
  "budgetMax": {budget_max_ai},
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD", 
  "applicationDeadline": "YYYY-MM-DD",
  "aiInsights": {{
    "strategy": "Strategic approach explanation",
    "reasoning": "Why these choices were made based on requirements",
    "successFactors": ["factor1", "factor2", "factor3"],
    "potentialChallenges": ["challenge1", "challenge2"],
    "optimizationSuggestions": ["suggestion1", "suggestion2"]
  }},
  "confidence": 0.85 
}}
Ensure the entire response is a single, valid JSON object with no extra text, and all strings are properly quoted and elements correctly comma-separated. Dates should be placeholders like YYYY-MM-DD unless specific dates can be inferred.
"""
    return prompt

# --- Helper: Generate Fallback Campaign (Python version) ---
def generate_fallback_campaign_py(requirements_data):
    print("🤖 Campaign Agent (Backend): Generating campaign using OFFLINE algorithmic strategy...")
    company_name = requirements_data.get('companyName', '[Company]')
    campaign_objective_list = requirements_data.get('campaignObjective', 'Achieve Goal').split(' ')
    campaign_objective_short = campaign_objective_list[0] if campaign_objective_list else 'Campaign'
    industry = requirements_data.get('industry', 'General')
    product_service = requirements_data.get('productService', '[Product/Service]')
    target_audience = requirements_data.get('targetAudience', '[Target Audience]')
    budget_min = int(requirements_data.get('budgetRange', {}).get('min', 10000) * 0.8)
    budget_max = int(requirements_data.get('budgetRange', {}).get('max', 50000) * 0.9)

    # Simplified date logic for fallback
    from datetime import datetime, timedelta
    start_date_obj = datetime.now() + timedelta(days=7)
    end_date_obj = start_date_obj + timedelta(days=30)
    app_deadline_obj = start_date_obj - timedelta(days=3)

    # Simplified platform/niche selection for fallback
    platforms = requirements_data.get('preferredPlatforms', ['instagram', 'youtube'])[:2]
    niches = [industry.lower(), 'lifestyle']

    return {
        "title": f"{company_name} {campaign_objective_short} Fallback Campaign",
        "brand": company_name,
        "description": f"Algorithmic fallback campaign to {requirements_data.get('campaignObjective', 'achieve objectives')} for {product_service}.",
        "brief": f"This fallback campaign aims to support {company_name}'s objectives for {product_service} targeting {target_audience} using {', '.join(platforms)}.",
        "platforms": platforms,
        "minFollowers": 10000,
        "niches": niches,
        "locations": ["India"],
        "deliverables": ["Generic Post", "Generic Story"],
        "budgetMin": budget_min,
        "budgetMax": budget_max,
        "startDate": start_date_obj.strftime('%Y-%m-%d'),
        "endDate": end_date_obj.strftime('%Y-%m-%d'),
        "applicationDeadline": app_deadline_obj.strftime('%Y-%m-%d'),
        "aiInsights": {
            "strategy": "Default algorithmic strategy focusing on core requirements.",
            "reasoning": "Generated due to AI unavailability or error.",
            "successFactors": ["Clear call to action", "Targeted audience match"],
            "potentialChallenges": ["Lower engagement than AI-optimized", "Generic content appeal"],
            "optimizationSuggestions": ["Manually refine creator list", "Customize outreach messages"]
        },
        "confidence": 0.60, # Lower confidence for algorithmic fallback
        "agentVersion": "campaign-builder-fallback-py-v1.0",
        "generatedAt": datetime.now().isoformat()
    }

@app.route('/api/campaign/generate', methods=['POST'])
@token_required # Secure this endpoint
def handle_generate_campaign():
    requirements_data = request.json
    if not requirements_data:
        return jsonify({"success": False, "error": "Missing business requirements in request body."}), 400

    if not groq_api_key:
        print("🤖 Campaign Agent (Backend): Groq API key not configured. Using fallback campaign strategy.")
        fallback_campaign = generate_fallback_campaign_py(requirements_data)
        return jsonify({"success": True, "campaign": fallback_campaign, "method": "algorithmic_fallback"})

    prompt = build_campaign_generation_prompt(requirements_data)
    try:
        print(f"🤖 Campaign Agent (Backend): Making AI API call for campaign generation...")
        headers = {
            "Authorization": f"Bearer {groq_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama3-70b-8192", 
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 2000 # Adjusted for potentially longer campaign details
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data['choices'][0]['message']['content']
        
        try:
            json_str = ai_message_content # Default to the full content
            # Attempt to strip markdown fences if present
            if ai_message_content.strip().startswith("```json"):
                # Find the start of the actual JSON after the ```json
                json_block_start = ai_message_content.find('{')
                # Find the end of the JSON before the closing ```
                json_block_end = ai_message_content.rfind('}')
                if json_block_start != -1 and json_block_end != -1 and json_block_start < json_block_end:
                    json_str = ai_message_content[json_block_start : json_block_end + 1]
            elif ai_message_content.strip().startswith("{") and ai_message_content.strip().endswith("}"):
                json_str = ai_message_content.strip() # It's already a JSON string (hopefully)
            else: # If no clear JSON structure, try finding the first { and last }
                json_start_index = ai_message_content.find('{')
                json_end_index = ai_message_content.rfind('}')
                if json_start_index != -1 and json_end_index != -1 and json_start_index < json_end_index:
                    json_str = ai_message_content[json_start_index : json_end_index + 1]
                else:
                    raise ValueError("Could not find any JSON-like block in AI response.")

            content = json.loads(json_str) 
            
            # Adapt the 'body' field from AI to 'message' for consistent response structure with other endpoints
            if "body" in content and "message" not in content:
                content["message"] = content.pop("body")

            # Basic validation for expected keys after adaptation
            if not all(k in content for k in ["title", "brand", "description", "platforms"]):
                raise ValueError("AI campaign response JSON missing required keys")
            
            # Add agent metadata not directly from LLM
            content['agentVersion'] = 'campaign-builder-py-v1.0'
            content['generatedAt'] = datetime.now().isoformat()
            if 'confidence' not in content: content['confidence'] = 0.85 # Default if not provided

            print(f"✅ Campaign Agent (Backend): AI campaign generated successfully: {content.get('title')}")
            return jsonify({"success": True, "campaign": content, "method": "ai_generated"})
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing AI campaign JSON response: {e}. Raw: {ai_message_content}")
            fallback_campaign = generate_fallback_campaign_py(requirements_data)
            return jsonify({"success": True, "campaign": fallback_campaign, "method": "algorithmic_fallback", "error": "AI response parsing failed, using fallback campaign."})

    except requests.exceptions.RequestException as e:
        print(f"Groq API request failed for campaign generation: {e}")
        fallback_campaign = generate_fallback_campaign_py(requirements_data)
        return jsonify({"success": True, "campaign": fallback_campaign, "method": "algorithmic_fallback", "error": str(e)})
    except Exception as e:
        print(f"An unexpected error occurred during AI campaign generation: {e}")
        fallback_campaign = generate_fallback_campaign_py(requirements_data)
        return jsonify({"success": True, "campaign": fallback_campaign, "method": "algorithmic_fallback", "error": "Unexpected backend error during AI campaign generation."})

# --- Helper: Build Creator Scoring Prompt (Python version) ---
def build_creator_scoring_prompt(campaign_data, creator_data):
    # Extract relevant details for the prompt
    campaign_title = campaign_data.get('title', '[Campaign Title]')
    campaign_brief = campaign_data.get('brief', '[Campaign Brief]')[:300] # Summary of brief
    campaign_niches = ", ".join(campaign_data.get('niches', []))
    campaign_platforms = ", ".join(campaign_data.get('platforms', []))
    campaign_budget_min = campaign_data.get('budgetMin', 0)
    campaign_budget_max = campaign_data.get('budgetMax', 0)

    creator_name = creator_data.get('name', '[Creator Name]')
    creator_platform = creator_data.get('platform', '[Platform]')
    creator_followers = creator_data.get('metrics', {}).get('followers', 0)
    creator_engagement = creator_data.get('metrics', {}).get('engagementRate', 0)
    creator_niche_list = creator_data.get('niche', [])
    creator_niches_str = ", ".join(creator_niche_list)
    creator_bio = creator_data.get('bio', '')[:200] # Summary of bio
    creator_avg_likes = creator_data.get('metrics', {}).get('avgLikes', 0)
    creator_avg_comments = creator_data.get('metrics', {}).get('avgComments', 0)
    creator_post_rate = creator_data.get('rates', {}).get('post', 0)

    prompt = f"""You are an AI expert at evaluating influencer-campaign fit. Analyze the provided campaign and creator details to generate a compatibility score and detailed assessment.

CAMPAIGN DETAILS:
- Title: {campaign_title}
- Brief Summary: {campaign_brief}...
- Target Niches: {campaign_niches}
- Target Platforms: {campaign_platforms}
- Budget Range: ₹{campaign_budget_min}-₹{campaign_budget_max}

CREATOR DETAILS:
- Name: {creator_name}
- Platform: {creator_platform}
- Followers: {creator_followers:,}
- Engagement Rate: {creator_engagement}%
- Niches: {creator_niches_str}
- Bio Summary: {creator_bio}...
- Avg Likes: {creator_avg_likes:,}
- Avg Comments: {creator_avg_comments:,}
- Est. Post Rate: ₹{creator_post_rate:,}

EVALUATION TASK:
Provide a comprehensive analysis in JSON format. The score should be between 0-100.

JSON Response Structure:
{{
  "score": number, // Overall compatibility score (0-100)
  "reasoning": "Detailed explanation for the score, highlighting alignment and potential gaps.",
  "strengths": ["Specific strength 1 (e.g., Strong niche alignment)", "Specific strength 2"],
  "concerns": ["Specific concern 1 (e.g., Engagement rate slightly below ideal)", "Specific concern 2 (if any)"],
  "fitAnalysis": {{
    "audienceAlignment": number, // Score 0-100
    "contentQuality": number,    // Score 0-100 (based on implicit quality from bio/niche)
    "engagementRateFit": number, // Score 0-100 (how well engagement fits campaign goals)
    "brandSafety": number,      // Score 0-100 (assume high unless bio indicates issues)
    "costEfficiency": number   // Score 0-100 (based on rate vs budget)
  }},
  "recommendedAction": "highly_recommend" | "recommend" | "consider" | "not_recommended",
  "estimatedPerformance": {{
    "expectedReach": number, // e.g., 75% of followers
    "expectedEngagement": number, // e.g., followers * engagementRate
    "expectedROI": number // A qualitative or simple numeric ROI estimate (e.g., 2.0 to 3.5)
  }}
}}

Instructions for AI:
- Base the `score` on overall fit. 
- `reasoning` should be specific and actionable.
- `strengths` should highlight positive matches.
- `concerns` should point out potential issues or areas for verification.
- `fitAnalysis` sub-scores should reflect how well creator attributes match campaign needs.
- `recommendedAction` should be based on the overall score (e.g., >80 highly_recommend, >65 recommend, >45 consider).
- `estimatedPerformance` should be realistic based on provided metrics.
Ensure the entire response is a single, valid JSON object with no extra text, and all strings are properly quoted and elements correctly comma-separated.
"""
    return prompt

# --- Helper: Generate Fallback Scoring (Python version) ---
def generate_fallback_scoring_py(campaign_data, creator_data):
    print(f"🤖 Creator Scoring (Backend): Generating FALLBACK score for {creator_data.get('name', 'N/A')}...")
    score = 50  # Base fallback score
    reasons = ["Fallback scoring due to AI unavailability or error."]
    strengths = ["Basic profile data available."]
    concerns = ["Full AI-driven analysis not performed."]
    
    # Basic checks for fallback score adjustment
    if creator_data.get('platform') in campaign_data.get('platforms', []):
        score += 10
        reasons.append("Platform match.")
        strengths.append("Platform aligned with campaign.")
    else:
        concerns.append("Platform mismatch.")

    if creator_data.get('metrics', {}).get('followers', 0) >= campaign_data.get('minFollowers', 5000):
        score += 10
        reasons.append("Sufficient follower count.")
        strengths.append("Meets minimum follower requirement.")
    else:
        concerns.append("Follower count below minimum.")

    creator_post_rate = creator_data.get('rates', {}).get('post', float('inf'))
    campaign_budget_max = campaign_data.get('budgetMax', 0)
    if creator_post_rate <= campaign_budget_max:
        score += 5
        strengths.append("Rate within campaign budget.")
    else:
        concerns.append("Stated rate may exceed campaign max budget.")

    score = min(max(score, 0), 100) # Cap score between 0-100

    recommended_action = "consider"
    if score >= 80: recommended_action = "highly_recommend"
    elif score >= 65: recommended_action = "recommend"
    elif score < 45: recommended_action = "not_recommended"

    return {
        "score": score,
        "reasoning": " ".join(reasons),
        "strengths": strengths,
        "concerns": concerns,
        "fitAnalysis": {
            "audienceAlignment": score * 0.8, # Simplified
            "contentQuality": 60,
            "engagementRateFit": score * 0.7,
            "brandSafety": 75,
            "costEfficiency": 50 if creator_post_rate > campaign_budget_max else 70
        },
        "recommendedAction": recommended_action,
        "estimatedPerformance": {
            "expectedReach": int(creator_data.get('metrics', {}).get('followers', 0) * 0.7),
            "expectedEngagement": int(creator_data.get('metrics', {}).get('followers', 0) * creator_data.get('metrics', {}).get('engagementRate', 0) / 100),
            "expectedROI": 1.5
        }
    }

@app.route('/api/creator/score', methods=['POST'])
@token_required
def handle_score_creator():
    data = request.json
    if not data or not all(k in data for k in ['campaign', 'creator']):
        return jsonify({"success": False, "error": "Missing campaign or creator data in request body."}), 400

    campaign_data = data['campaign']
    creator_data = data['creator']

    if not groq_api_key:
        print("🤖 Creator Scoring (Backend): Groq API key not configured. Using fallback scoring.")
        fallback_match_data = generate_fallback_scoring_py(campaign_data, creator_data)
        return jsonify({"success": True, "creatorMatch": fallback_match_data, "method": "algorithmic_fallback"})

    prompt = build_creator_scoring_prompt(campaign_data, creator_data)
    try:
        print(f"🤖 Creator Scoring (Backend): Making AI API call for {creator_data.get('name', 'N/A')}...")
        headers = {
            "Authorization": f"Bearer {groq_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama3-70b-8192",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2, # More factual for scoring
            "max_tokens": 1000 
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data['choices'][0]['message']['content']
        
        try:
            json_str = ai_message_content # Default to the full content
            # Attempt to strip markdown fences if present
            if ai_message_content.strip().startswith("```json"):
                # Find the start of the actual JSON after the ```json
                json_block_start = ai_message_content.find('{')
                # Find the end of the JSON before the closing ```
                json_block_end = ai_message_content.rfind('}')
                if json_block_start != -1 and json_block_end != -1 and json_block_start < json_block_end:
                    json_str = ai_message_content[json_block_start : json_block_end + 1]
            elif ai_message_content.strip().startswith("{") and ai_message_content.strip().endswith("}"):
                json_str = ai_message_content.strip() # It's already a JSON string (hopefully)
            else: # If no clear JSON structure, try finding the first { and last }
                json_start_index = ai_message_content.find('{')
                json_end_index = ai_message_content.rfind('}')
                if json_start_index != -1 and json_end_index != -1 and json_start_index < json_end_index:
                    json_str = ai_message_content[json_start_index : json_end_index + 1]
                else:
                    raise ValueError("Could not find any JSON-like block in AI response.")

            content = json.loads(json_str) 
            
            # Adapt the 'body' field from AI to 'message' for consistent response structure with other endpoints
            if "body" in content and "message" not in content:
                content["message"] = content.pop("body")

            # Basic validation for expected keys after adaptation
            if not all(k in content for k in ["score", "reasoning", "recommendedAction"]):
                raise ValueError("AI scoring response JSON missing required keys")
            
            print(f"✅ Creator Scoring (Backend): AI score generated for {creator_data.get('name', 'N/A')}: {content.get('score')}")
            # The CreatorMatch object might be more complex, this returns the AI's direct output
            # The frontend might still do some final assembly of the full CreatorMatch object if needed
            return jsonify({"success": True, "creatorMatch": content, "method": "ai_generated"})
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing AI scoring JSON response: {e}. Raw: {ai_message_content}")
            fallback_match_data = generate_fallback_scoring_py(campaign_data, creator_data)
            return jsonify({"success": True, "creatorMatch": fallback_match_data, "method": "algorithmic_fallback", "error": "AI response parsing failed, using fallback."})

    except requests.exceptions.RequestException as e:
        print(f"Groq API request failed for creator scoring: {e}")
        fallback_match_data = generate_fallback_scoring_py(campaign_data, creator_data)
        return jsonify({"success": True, "creatorMatch": fallback_match_data, "method": "algorithmic_fallback", "error": str(e)})
    except Exception as e:
        print(f"An unexpected error occurred during AI creator scoring: {e}")
        fallback_match_data = generate_fallback_scoring_py(campaign_data, creator_data)
        return jsonify({"success": True, "creatorMatch": fallback_match_data, "method": "algorithmic_fallback", "error": "Unexpected backend error during AI creator scoring."})

# --- Helper: Build Creator Query Analysis Prompt (Python version) ---
def build_creator_query_analysis_prompt(user_query_text, conversation_context_text=None):
    context_section = ""
    if conversation_context_text and conversation_context_text.strip():
        context_section = f"""CONVERSATION CONTEXT (Previous messages):
{conversation_context_text}

Based on the above context and the latest user query:"""
    else:
        context_section = "Based on the user query:"

    prompt = f"""You are an AI assistant expert in understanding influencer marketing search queries. 
Analyze the following user query and any provided conversation context to determine their intent and extract key search criteria.

{context_section}
User Query: "{user_query_text}"

TASK:
1. Determine the primary `intent` of the user (e.g., "find budget influencers", "find high engagement creators", "niche specific search").
2. Determine the `queryType`: one of ["budget_optimization", "reach_maximization", "engagement_focused", "niche_targeting", "general_search"].
3. Extract key criteria like `platforms` (list of strings), `niches` (list of strings), `followerRange` (string, e.g., "50k-100k", "1M+"), `budget` (string, e.g., "under $500", "flexible"), `location` (string).
4. Identify up to 3 `keyRequirements` (list of strings) that are most important from the query.

Response format (JSON only):
{{
  "intent": "User's primary goal.",
  "queryType": "selected_query_type",
  "extractedCriteria": {{
    "platforms": ["platform1", "platform2"],
    "niches": ["nicheA", "nicheB"],
    "followerRange": "e.g., 10k-50k",
    "budget": "e.g., around $1000",
    "location": "e.g., USA"
  }},
  "keyRequirements": ["most important requirement 1", "requirement 2"],
  "confidence": 0.85 // Your confidence in this analysis (0.0-1.0)
}}

Ensure the entire response is a single, valid JSON object. If a criterion is not mentioned, omit it or use null/empty list.
"""
    return prompt

# --- Helper: Generate Fallback Query Analysis (Python version) ---
def generate_fallback_query_analysis_py(user_query_text):
    print(f"🤖 Creator Query Analysis (Backend): Generating FALLBACK analysis for query: {user_query_text[:50]}...")
    # Basic keyword matching for fallback
    query_lower = user_query_text.lower()
    query_type = "general_search"
    niches = []
    platforms = []

    if "budget" in query_lower or "cheap" in query_lower or "affordable" in query_lower:
        query_type = "budget_optimization"
    elif "reach" in query_lower or "followers" in query_lower or "audience" in query_lower:
        query_type = "reach_maximization"
    elif "engagement" in query_lower or "interact" in query_lower:
        query_type = "engagement_focused"
    
    if "instagram" in query_lower: platforms.append("instagram")
    if "youtube" in query_lower: platforms.append("youtube")
    if "tiktok" in query_lower: platforms.append("tiktok")

    # This is a very simplified extraction for fallback
    return {
        "intent": "Basic understanding: user is looking for influencers.",
        "queryType": query_type,
        "extractedCriteria": {
            "platforms": platforms if platforms else None,
            "niches": ["general"] # Default niche for fallback
        },
        "keyRequirements": [user_query_text[:70] + "... (algorithmic extraction)"],
        "confidence": 0.40
    }

@app.route('/api/creator/analyze-query', methods=['POST'])
@token_required # Secure this endpoint
def handle_analyze_creator_query():
    data = request.json
    if not data or not data.get('query'):
        return jsonify({"success": False, "error": "Missing 'query' in request body."}), 400

    user_query = data['query']
    conversation_context = data.get('conversationContext') # Optional

    if not groq_api_key:
        print("🤖 Creator Query Analysis (Backend): Groq API key not configured. Using fallback analysis.")
        fallback_analysis = generate_fallback_query_analysis_py(user_query)
        return jsonify({"success": True, "analysis": fallback_analysis, "method": "algorithmic_fallback"})

    prompt = build_creator_query_analysis_prompt(user_query, conversation_context)
    try:
        print(f"🤖 Creator Query Analysis (Backend): Making AI API call for query: {user_query[:50]}...")
        headers = {
            "Authorization": f"Bearer {groq_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama3-70b-8192", 
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2, 
            "max_tokens": 800 
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data['choices'][0]['message']['content']
        
        try:
            json_str = ai_message_content # Default to the full content
            # Attempt to strip markdown fences if present
            if ai_message_content.strip().startswith("```json"):
                # Find the start of the actual JSON after the ```json
                json_block_start = ai_message_content.find('{')
                # Find the end of the JSON before the closing ```
                json_block_end = ai_message_content.rfind('}')
                if json_block_start != -1 and json_block_end != -1 and json_block_start < json_block_end:
                    json_str = ai_message_content[json_block_start : json_block_end + 1]
            elif ai_message_content.strip().startswith("{") and ai_message_content.strip().endswith("}"):
                json_str = ai_message_content.strip() # It's already a JSON string (hopefully)
            else: # If no clear JSON structure, try finding the first { and last }
                json_start_index = ai_message_content.find('{')
                json_end_index = ai_message_content.rfind('}')
                if json_start_index != -1 and json_end_index != -1 and json_start_index < json_end_index:
                    json_str = ai_message_content[json_start_index : json_end_index + 1]
                else:
                    raise ValueError("Could not find any JSON-like block in AI response.")

            content = json.loads(json_str) 
            
            # Adapt the 'body' field from AI to 'message' for consistent response structure with other endpoints
            if "body" in content and "message" not in content:
                content["message"] = content.pop("body")

            # Basic validation for expected keys after adaptation
            if not all(k in content for k in ["intent", "queryType", "extractedCriteria"]):
                raise ValueError("AI query analysis JSON missing required keys")
            
            print(f"✅ Creator Query Analysis (Backend): AI analysis successful for query: {user_query[:50]}...")
            return jsonify({"success": True, "analysis": content, "method": "ai_generated"})
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing AI query analysis JSON: {e}. Raw: {ai_message_content}")
            fallback_analysis = generate_fallback_query_analysis_py(user_query)
            return jsonify({"success": True, "analysis": fallback_analysis, "method": "algorithmic_fallback", "error": "AI response parsing failed, using fallback."})

    except requests.exceptions.RequestException as e:
        print(f"Groq API request failed for query analysis: {e}")
        fallback_analysis = generate_fallback_query_analysis_py(user_query)
        return jsonify({"success": True, "analysis": fallback_analysis, "method": "algorithmic_fallback", "error": str(e)})
    except Exception as e:
        print(f"An unexpected error occurred during AI query analysis: {e}")
        fallback_analysis = generate_fallback_query_analysis_py(user_query)
        return jsonify({"success": True, "analysis": fallback_analysis, "method": "algorithmic_fallback", "error": "Unexpected backend error during query analysis."})

# --- Helper: Build Initial Outreach Prompt (Python version) ---
def build_initial_outreach_prompt_py(creator_data, brand_info_data, campaign_context_str):
    creator_name = creator_data.get('name', '[Creator Name]')
    creator_username = creator_data.get('username', '[username]')
    creator_platform = creator_data.get('platform', '[Platform]')
    creator_followers = creator_data.get('metrics', {}).get('followers', 0)
    creator_engagement = creator_data.get('metrics', {}).get('engagementRate', 0)
    creator_niches = ", ".join(creator_data.get('niche', []))
    creator_location = creator_data.get('location', '[Location]')
    creator_rating = creator_data.get('rating', 0)
    creator_response_time = creator_data.get('responseTime', '[Response Time]')
    creator_verified = "Verified ✓" if creator_data.get('verified') else "Not verified"
    creator_post_rate = creator_data.get('rates', {}).get('post', 0)

    brand_name = brand_info_data.get('name', '[Brand Name]')
    brand_industry = brand_info_data.get('industry', '[Industry]')
    brand_campaign_goals = ", ".join(brand_info_data.get('campaignGoals', []))
    brand_budget_min = brand_info_data.get('budget', {}).get('min', 0)
    brand_budget_max = brand_info_data.get('budget', {}).get('max', 0)
    brand_timeline = brand_info_data.get('timeline', '[Timeline]')
    brand_deliverables = ", ".join(brand_info_data.get('contentRequirements', []))

    prompt = f"""You are an expert influencer marketing strategist. Generate a highly personalized, compelling outreach email.

CREATOR PROFILE:
- Name: {creator_name} (@{creator_username})
- Platform: {creator_platform}
- Followers: {creator_followers:,}
- Engagement: {creator_engagement}% ({'HIGH' if creator_engagement > 3 else 'GOOD' if creator_engagement > 1.5 else 'NEEDS IMPROVEMENT'})
- Niches: {creator_niches}
- Location: {creator_location}
- Rating: {creator_rating}/5
- Response Time: {creator_response_time}
- Verified: {creator_verified}
- Est. Rate: ₹{creator_post_rate:,}

BRAND COLLABORATION:
- Brand: {brand_name}
- Industry: {brand_industry}
- Campaign Objectives: {brand_campaign_goals}
- Budget: ₹{brand_budget_min:,} - ₹{brand_budget_max:,}
- Timeline: {brand_timeline}
- Deliverables: {brand_deliverables}
- Campaign Context: {campaign_context_str}

OUTREACH STRATEGY:
1. PERSONALIZATION: Reference specific content or achievements.
2. VALUE PROPOSITION: Clear mutual benefits.
3. ENGAGEMENT: Acknowledge audience quality.
4. TONE: Respectful, enthusiastic, not pushy.
5. NEXT STEPS: Clear call-to-action.

JSON Response Format (ONLY JSON, no other text):
{{
  "subject": "Compelling subject line (6-10 words, e.g., Collaboration: {brand_name} x {creator_name}?)",
  "body": "Personalized email (200-300 words): Greeting, personalized intro, brand opportunity, why they fit, benefits, next steps, closing.",
  "reasoning": "Strategic explanation of personalization and messaging choices for this specific creator.",
  "keyPoints": ["Personalization element 1", "Value prop 1", "Relationship building tactic"],
  "nextSteps": ["Creator action (e.g., Reply with availability)", "Brand action (e.g., Send detailed brief)"],
  "confidence": 0.90
}}
Focus on authentic connection for long-term partnership.
"""
    return prompt

# --- Helper: Generate Fallback Initial Outreach (Python version) ---
def generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str):
    creator_name = creator_data.get('name', 'Creator')
    brand_name = brand_info_data.get('name', 'Our Brand')
    subject = f"Collaboration Opportunity: {brand_name} x {creator_name}"
    body = f"""Hi {creator_name},

We are impressed with your content on {creator_data.get('platform', 'your platform')} and would love to discuss a potential collaboration with {brand_name} for our upcoming campaign: {campaign_context_str}.

We believe your audience aligns well with our goals. Please let us know if you're interested in learning more.

Best,
The {brand_name} Team"""
    return {
        "subject": subject,
        "message": body, # Changed from 'body' to 'message' to match expected response structure
        "reasoning": "Standard algorithmic fallback outreach message.",
        "keyPoints": ["Generic introduction", "Basic value proposition"],
        "nextSteps": ["Await creator response"],
        "confidence": 0.5
    }

@app.route('/api/outreach/initial-message', methods=['POST'])
@token_required
def handle_generate_initial_outreach():
    data = request.json
    if not data or not all(k in data for k in ['creator', 'brandInfo', 'campaignContext']):
        return jsonify({"success": False, "error": "Missing creator, brandInfo, or campaignContext."}), 400

    creator_data = data['creator']
    brand_info_data = data['brandInfo']
    campaign_context_str = data['campaignContext']

    if not groq_api_key:
        print("🤖 Initial Outreach (Backend): Groq API key missing. Using template fallback.")
        fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback"})

    prompt = build_initial_outreach_prompt_py(creator_data, brand_info_data, campaign_context_str)
    try:
        print(f"🤖 Initial Outreach (Backend): Calling Groq for {creator_data.get('name', 'N/A')}")
        headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
        payload = {"model": "llama3-70b-8192", "messages": [{"role": "user", "content": prompt}], "temperature": 0.4, "max_tokens": 1000}
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data['choices'][0]['message']['content']
        
        try:
            json_str = ai_message_content # Default to the full content
            # Attempt to strip markdown fences if present
            if ai_message_content.strip().startswith("```json"):
                # Find the start of the actual JSON after the ```json
                json_block_start = ai_message_content.find('{')
                # Find the end of the JSON before the closing ```
                json_block_end = ai_message_content.rfind('}')
                if json_block_start != -1 and json_block_end != -1 and json_block_start < json_block_end:
                    json_str = ai_message_content[json_block_start : json_block_end + 1]
            elif ai_message_content.strip().startswith("{") and ai_message_content.strip().endswith("}"):
                json_str = ai_message_content.strip() # It's already a JSON string (hopefully)
            else: # If no clear JSON structure, try finding the first { and last }
                json_start_index = ai_message_content.find('{')
                json_end_index = ai_message_content.rfind('}')
                if json_start_index != -1 and json_end_index != -1 and json_start_index < json_end_index:
                    json_str = ai_message_content[json_start_index : json_end_index + 1]
                else:
                    raise ValueError("Could not find any JSON-like block in AI response.")

            content = json.loads(json_str) 
            
            # Adapt the 'body' field from AI to 'message' for consistent response structure with other endpoints
            if "body" in content and "message" not in content:
                content["message"] = content.pop("body")

            # Basic validation for expected keys after adaptation
            if not all(k in content for k in ["subject", "message"]):
                raise ValueError("AI initial outreach response JSON missing required keys (subject, message) after adaptation")
            
            return jsonify({"success": True, **content, "method": "ai_generated"})
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing AI initial outreach JSON: {e}. Raw content received: {ai_message_content}")
            fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
            return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error": f"AI response parsing failed ({e}), using fallback."})

    except requests.exceptions.RequestException as e:
        print(f"Groq API request failed for initial outreach: {e}")
        fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error": str(e)})
    except Exception as e:
        print(f"Unexpected error during AI initial outreach: {e}")
        fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error": "Unexpected backend error."})

# --- Helper: Determine Follow-up Strategy (Python version) ---
def determine_follow_up_strategy_py(days_since_last_contact, _previous_email_type):
    # This logic can be expanded based on previous_email_type too
    if days_since_last_contact <= 3:
        return {"strategy": "Wait Longer", "tone": "Patient", "focus": "Give space"}
    elif days_since_last_contact <= 7:
        return {"strategy": "Gentle Reminder", "tone": "Friendly & Understanding", "focus": "Soft check-in + value"}
    elif days_since_last_contact <= 14:
        return {"strategy": "Value-Added Follow-up", "tone": "Professional & Informative", "focus": "Share updates or improved offer"}
    elif days_since_last_contact <= 30:
        return {"strategy": "Strategic Re-engagement", "tone": "Direct & Respectful", "focus": "Best offer or deadline"}
    else:
        return {"strategy": "Relationship Preservation", "tone": "Gracious & Future-Focused", "focus": "Keep door open"}

# --- Helper: Get Follow-up Guidelines (Python version) ---
def get_follow_up_guidelines_py(days_since_last_contact, _previous_email_type):
    if days_since_last_contact <= 7:
        return "EARLY FOLLOW-UP: Acknowledge they might still be considering. Provide additional value. No pressure."
    elif days_since_last_contact <= 14:
        return "MID-TERM FOLLOW-UP: Reference campaign timeline. Share new achievements. Offer slight incentive or flexibility."
    elif days_since_last_contact <= 30:
        return "LATE FOLLOW-UP: Likely final attempt. Provide best offer. Create gentle urgency. Offer alternatives."
    else:
        return "RELATIONSHIP PRESERVATION: Acknowledge this campaign may not be a fit. Keep door open for future."

# --- Helper: Build Follow-up Email Prompt (Python version) ---
def build_follow_up_email_prompt_py(creator_data, brand_info_data, days_since_last_contact, previous_email_type, conversation_context_str=None):
    creator_name = creator_data.get('name', '[Creator Name]')
    brand_name = brand_info_data.get('name', '[Brand Name]')
    
    follow_up_strategy_info = determine_follow_up_strategy_py(days_since_last_contact, previous_email_type)
    follow_up_guidelines = get_follow_up_guidelines_py(days_since_last_contact, previous_email_type)

    context_prompt_section = ""
    if conversation_context_str and conversation_context_str.strip():
        context_prompt_section = f"\nRECENT CONVERSATION SNIPPET:\n{conversation_context_str}\n"

    prompt = f"""You are an expert relationship manager for influencer collaborations. Generate an intelligent follow-up email.

CREATOR: {creator_name} ({creator_data.get('platform', '')})
BRAND: {brand_name}

FOLLOW-UP CONTEXT:
- Days Since Last Contact: {days_since_last_contact}
- Previous Email Type: {previous_email_type}
- Current Follow-up Strategy: {follow_up_strategy_info['strategy']}
- Recommended Tone: {follow_up_strategy_info['tone']}
- Key Focus for this email: {follow_up_strategy_info['focus']}
{context_prompt_section}
SPECIFIC GUIDELINES FOR THIS FOLLOW-UP:
{follow_up_guidelines}

EMAIL REQUIREMENTS:
- Acknowledge the time since last contact appropriately.
- If providing new info or value, make it clear and concise.
- Maintain a professional, respectful, and engaging tone based on the strategy.
- Include a clear call-to-action or an easy way for them to respond/decline.
- Keep the email brief and to the point.

JSON Response Format (ONLY JSON, no other text):
{{
  "subject": "Strategic follow-up subject (e.g., Following Up: {brand_name} x {creator_name} Collaboration?)",
  "body": "Complete follow-up email text, incorporating the strategy and guidelines above.",
  "reasoning": "Explanation of why this specific follow-up approach and messaging were chosen.",
  "keyPoints": ["Key element of this follow-up 1", "Key element 2"],
  "nextSteps": ["Expected creator action", "Brand next step"],
  "confidence": 0.80 
}}
Ensure the JSON is valid, strings are quoted, and commas are used correctly.
"""
    return prompt

# --- Helper: Generate Fallback Follow-up (Python version) ---
def generate_fallback_follow_up_py(creator_data, brand_info_data, days_since_last_contact):
    creator_name = creator_data.get('name', 'Creator')
    brand_name = brand_info_data.get('name', 'Our Brand')
    subject = f"Following Up: {brand_name} & {creator_name} Collaboration"
    body = f"""Hi {creator_name},

Just wanted to gently touch base regarding our previous message about a potential collaboration with {brand_name}. 
It has been {days_since_last_contact} days, and we wanted to see if you had any thoughts or questions.

We understand you're busy, so no pressure at all. If you're interested, we'd love to hear from you. If not, we appreciate your time and wish you the best!

Sincerely,
The {brand_name} Team"""
    return {
        "subject": subject,
        "message": body,
        "reasoning": "Standard algorithmic fallback follow-up message.",
        "keyPoints": ["Gentle reminder", "Respectful tone"],
        "nextSteps": ["Monitor for any response"],
        "confidence": 0.45
    }

@app.route('/api/outreach/follow-up-message', methods=['POST'])
@token_required
def handle_generate_follow_up_message():
    data = request.json
    required_keys = ['creator', 'brandInfo', 'daysSinceLastContact', 'previousEmailType']
    if not data or not all(k in data for k in required_keys):
        return jsonify({"success": False, "error": f"Missing one or more required keys: {', '.join(required_keys)}."}), 400

    creator_data = data['creator']
    brand_info_data = data['brandInfo']
    days_since_last_contact = data['daysSinceLastContact']
    previous_email_type = data['previousEmailType']
    conversation_context = data.get('conversationContext') # Optional

    if not groq_api_key:
        print("🤖 Follow-up (Backend): Groq API key missing. Using template fallback.")
        fallback_content = generate_fallback_follow_up_py(creator_data, brand_info_data, days_since_last_contact)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback"})

    prompt = build_follow_up_email_prompt_py(creator_data, brand_info_data, days_since_last_contact, previous_email_type, conversation_context)
    try:
        print(f"🤖 Follow-up (Backend): Calling Groq for {creator_data.get('name', 'N/A')} (Follow-up)")
        headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
        payload = {"model": "llama3-70b-8192", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 800}
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data['choices'][0]['message']['content']
        
        try:
            json_str = ai_message_content # Default to the full content
            # Attempt to strip markdown fences if present
            if ai_message_content.strip().startswith("```json"):
                # Find the start of the actual JSON after the ```json
                json_block_start = ai_message_content.find('{')
                # Find the end of the JSON before the closing ```
                json_block_end = ai_message_content.rfind('}')
                if json_block_start != -1 and json_block_end != -1 and json_block_start < json_block_end:
                    json_str = ai_message_content[json_block_start : json_block_end + 1]
            elif ai_message_content.strip().startswith("{") and ai_message_content.strip().endswith("}"):
                json_str = ai_message_content.strip() # It's already a JSON string (hopefully)
            else: # If no clear JSON structure, try finding the first { and last }
                json_start_index = ai_message_content.find('{')
                json_end_index = ai_message_content.rfind('}')
                if json_start_index != -1 and json_end_index != -1 and json_start_index < json_end_index:
                    json_str = ai_message_content[json_start_index : json_end_index + 1]
                else:
                    raise ValueError("Could not find any JSON-like block in AI response.")

            content = json.loads(json_str) 
            
            # Adapt the 'body' field from AI to 'message' for consistent response structure with other endpoints
            if "body" in content and "message" not in content:
                content["message"] = content.pop("body")

            # Basic validation for expected keys after adaptation
            if not all(k in content for k in ["subject", "message"]):
                raise ValueError("AI follow-up response JSON missing required keys (subject, message) after adaptation")
            
            return jsonify({"success": True, **content, "method": "ai_generated"})
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing AI follow-up JSON: {e}. Raw: {ai_message_content}")
            fallback_content = generate_fallback_follow_up_py(creator_data, brand_info_data, days_since_last_contact)
            return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error": "AI response parsing failed, using fallback."})

    except requests.exceptions.RequestException as e:
        print(f"Groq API request failed for follow-up: {e}")
        fallback_content = generate_fallback_follow_up_py(creator_data, brand_info_data, days_since_last_contact)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error": str(e)})
    except Exception as e:
        print(f"Unexpected error during AI follow-up generation: {e}")
        fallback_content = generate_fallback_follow_up_py(creator_data, brand_info_data, days_since_last_contact)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error": "Unexpected backend error."})

# --- Helper: Generate Audio with ElevenLabs ---
def generate_audio_with_elevenlabs(text_to_speak, call_sid_for_filename="unknown_call"):
    """
    Generates audio using ElevenLabs and saves it to a temporary file.
    Returns a tuple: (public_audio_url, local_temp_file_path) or (None, None) on failure.
    """
    if not elevenlabs_client:
        print("🔊 ElevenLabs client not available. Cannot generate custom TTS.")
        return None, None

    temp_file_path = None # Initialize to ensure it has a value in case of early exit
    try:
        print(f"🔊 ElevenLabs: Attempting TTS for: {text_to_speak[:50]}...")
        
        audio_stream = elevenlabs_client.text_to_speech.stream(
            text=text_to_speak,
            voice_id=elevenlabs_voice_id, 
            model_id="eleven_multilingual_v2"
        )
        
        filename = f"{call_sid_for_filename}_{uuid.uuid4()}.mp3" # Include call_sid for better tracking
        temp_file_path = os.path.join(TEMP_AUDIO_DIR, filename)
        
        print(f"👂 ElevenLabs: Stream object created. Attempting to save to {temp_file_path}...")
        bytes_written = 0
        with open(temp_file_path, "wb") as f:
            for chunk in audio_stream:
                if chunk:
                    f.write(chunk)
                    bytes_written += len(chunk)
            print(f"👂 ElevenLabs: Finished writing to stream. Total bytes attempted: {bytes_written}.")
        
        # Check if file was actually created and has content
        if not os.path.exists(temp_file_path) or os.path.getsize(temp_file_path) == 0:
            print(f"⚠️ ElevenLabs TTS Error: File not created or is empty at {temp_file_path} after generation attempt. Bytes written: {bytes_written}.")
            if os.path.exists(temp_file_path): # If it exists but is empty
                try:
                    os.remove(temp_file_path)
                    print(f"🗑️ Cleaned up empty file: {temp_file_path}")
                except OSError as e:
                    print(f"🔥 Error deleting empty file {temp_file_path}: {e}")
            return None, None # Explicitly return None if file is problematic

        print(f"✅ ElevenLabs: File successfully saved. Path: {temp_file_path}, Size: {os.path.getsize(temp_file_path)} bytes.")
        base_url = os.getenv("BACKEND_PUBLIC_URL", f"http://localhost:{os.getenv('PORT', 5001)}").rstrip('/')
        public_audio_url = f"{base_url}/temp_audio/{filename}"
        print(f"🎧 ElevenLabs audio accessible at: {public_audio_url}")
        return public_audio_url, temp_file_path

    except Exception as e:
        print(f"❌ ElevenLabs TTS generation failed: {type(e).__name__} - {e}.")
        if hasattr(e, 'body') and e.body:
             print(f"   ElevenLabs API Error Body: {e.body}")
        # Cleanup partially created file if an error occurred during stream or save
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                print(f"🗑️ Cleaned up partial file due to error: {temp_file_path}")
            except OSError as ose:
                print(f"🔥 Error deleting partial file {temp_file_path}: {ose}")
        return None, None

# --- JWT Authentication Decorator ---
# ... existing code ...
# --- API Endpoint to Initiate Outbound Call ---
@app.route('/api/voice/make-call', methods=['POST'])
@token_required
def make_outbound_call():
    if not twilio_client:
        return jsonify({"success": False, "error": "Twilio client not configured on backend."}), 500

    data = request.json
    to_phone_number = data.get('to_phone_number')
    initial_message_text = data.get('message', "Hello from InfluencerFlowAI. This is a test call.")
    outreach_id = data.get('outreach_id', 'unknown_outreach') 

    if not to_phone_number:
        return jsonify({"success": False, "error": "Missing 'to_phone_number' in request body."}), 400

    # Step 1: Generate audio for the initial message
    # CallSid is not known yet, so use outreach_id or a generic marker for the filename suggestion
    initial_audio_url_for_twilio, temp_initial_audio_path = generate_audio_with_elevenlabs(initial_message_text, f"initial_{outreach_id}")
    
    try:
        base_url_for_callbacks = os.getenv("BACKEND_PUBLIC_URL", f"http://localhost:{os.getenv('PORT', 5001)}").rstrip('/')
        
        # The URL Twilio will request for the agent's first turn.
        agent_turn_twiml_url_base = f"{base_url_for_callbacks}/api/voice/agent_turn_twiml"
        
        from urllib.parse import urlencode
        twiml_params = {
            "outreach_id": outreach_id
        }
        if initial_audio_url_for_twilio:
            twiml_params['ai_audio_url'] = initial_audio_url_for_twilio
        else:
            # Fallback to sending text if ElevenLabs failed for the initial message
            twiml_params['ai_message_text'] = initial_message_text

        final_agent_turn_url = f"{agent_turn_twiml_url_base}?{urlencode(twiml_params)}"
        
        recording_status_callback_url = f"{base_url_for_callbacks}/api/voice/recording-status?outreach_id={outreach_id}"

        print(f"📞 Twilio: Making call to {to_phone_number} from {twilio_phone_number} using TwiML URL for agent's first turn: {final_agent_turn_url}")
        print(f"   Full call recording callback: {recording_status_callback_url}")
        
        call = twilio_client.calls.create(
            to=str(to_phone_number),
            from_=str(twilio_phone_number),
            url=str(final_agent_turn_url), 
            method="POST", # TwiML fetching endpoint should be POST
            record=True, 
            recording_status_callback=str(recording_status_callback_url),
            recording_status_callback_method="POST",
            recording_status_callback_event=['completed'] 
        )
        print(f"✅ Twilio call (2-way setup) initiated. SID: {call.sid}, Status: {call.status}")

        # Initialize artifact store for this call
        if call.sid not in call_artifacts_store:
            call_artifacts_store[call.sid] = {
                'outreach_id': outreach_id,
                'conversation_history': [],
                'full_recording_url': None, # Will be populated by callback
                'full_recording_duration': None # Will be populated by callback
            }
        # Add initial AI message to history
        call_artifacts_store[call.sid]['conversation_history'].append({
            'speaker': 'ai',
            'text': initial_message_text,
            'audio_url': initial_audio_url_for_twilio # Store the audio URL if generated
        })
        # Note: temp_initial_audio_path could be cleaned up later, e.g., after the call ends or via a periodic job

        return jsonify({"success": True, "call_sid": call.sid, "status": call.status, "initial_audio_url": initial_audio_url_for_twilio}), 200

    except Exception as e:
        print(f"❌ Twilio call initiation failed: {e}")
        # Cleanup temporary audio file if it was created and call failed
        if temp_initial_audio_path and os.path.exists(temp_initial_audio_path):
            try: os.remove(temp_initial_audio_path)
            except OSError as ose: print(f"Error deleting temp initial audio file {temp_initial_audio_path}: {ose}")
        return jsonify({"success": False, "error": str(e)}), 500

# --- Endpoint to receive call recording status updates from Twilio ---
@app.route("/api/voice/recording-status", methods=['POST'])
def handle_recording_status():
    outreach_id_from_query = request.args.get('outreach_id')
    call_sid = request.form.get('CallSid')
    recording_sid = request.form.get('RecordingSid')
    recording_url_from_twilio = request.form.get('RecordingUrl')
    recording_status = request.form.get('RecordingStatus')
    recording_duration = request.form.get('RecordingDuration')
    final_outreach_id = outreach_id_from_query if outreach_id_from_query else call_sid 

    print(f"🔴 REC STATUS: OutreachID: {final_outreach_id}, CallSid: {call_sid}, Status: {recording_status}")
    
    if recording_status == 'completed' and recording_url_from_twilio and supabase_admin_client and twilio_client:
        try:
            # ... (your existing logic to download recording from Twilio and upload to Supabase) ...
            recording_instance = twilio_client.recordings(request.form.get('RecordingSid')).fetch()
            mp3_uri = recording_instance.uri.replace(".json", ".mp3")
            full_media_url = f"https://api.twilio.com{mp3_uri}"
            auth = (twilio_account_sid, twilio_auth_token)
            media_response = requests.get(full_media_url, auth=auth)
            media_response.raise_for_status()
            audio_data = media_response.content
            bucket_name = "call-recordings"
            storage_file_path = f"{final_outreach_id}/{call_sid}_{request.form.get('RecordingSid')}.mp3"
            supabase_admin_client.storage.from_(bucket_name).upload(path=storage_file_path, file=audio_data, file_options={"content-type": "audio/mpeg"})
            actual_public_url_obj = supabase_client.storage.from_(bucket_name).get_public_url(storage_file_path)
            actual_public_url = actual_public_url_obj # Assume it's a string now, or handle list if needed
            
            print(f"✅ Full Call Recording for {final_outreach_id} uploaded. URL: {actual_public_url}")

            # Store/Update in our in-memory store, preserving conversation history
            if call_sid not in call_artifacts_store:
                call_artifacts_store[call_sid] = {'conversation_history': [], 'outreach_id': final_outreach_id} # Initialize if somehow missed
            
            call_artifacts_store[call_sid]['full_recording_url'] = actual_public_url
            call_artifacts_store[call_sid]['full_recording_duration'] = recording_duration
            # outreach_id should already be there from make_call, but good to ensure
            call_artifacts_store[call_sid]['outreach_id'] = final_outreach_id 
            print(f"💾 Artifact store updated for CallSid {call_sid} with full recording info. Conversation history preserved.")

        except Exception as e:
            print(f"❌ Error processing full call recording for {final_outreach_id}: {e}")
    return "", 200

# --- Endpoint to receive transcription status updates from Twilio ---
@app.route("/api/voice/transcription-status", methods=['POST'])
def handle_transcription_status():
    outreach_id_from_query = request.args.get('outreach_id')
    call_sid = request.form.get('CallSid')
    transcription_sid = request.form.get('TranscriptionSid')
    transcription_status = request.form.get('TranscriptionStatus')
    transcription_text = request.form.get('TranscriptionText')
    transcription_url = request.form.get('TranscriptionUrl') # URL to the transcription resource (JSON)
    
    final_outreach_id = outreach_id_from_query if outreach_id_from_query else call_sid

    print(f"📝 TRANSCRIPT STATUS: OutreachID: {final_outreach_id}, CallSid: {call_sid}, TranSid: {transcription_sid}, Status: {transcription_status}")

    if transcription_status == 'completed' and transcription_text:
        print(f"🗣️ Transcript for {final_outreach_id} (CallSid: {call_sid}):\n{transcription_text}")
        
        # TODO: Store this transcription in Conversation History for the final_outreach_id
        # This is where you would integrate with your outreachStorage logic (via API or direct DB if backend owns data)
        # Example (conceptual, actual implementation depends on your data layer):
        # db_service.add_conversation_message(
        #     outreach_id=final_outreach_id, 
        #     content=transcription_text, 
        #     sender='creator', # Assuming transcript is of the creator's speech primarily after agent speaks
        #     type='voice_transcript', 
        #     metadata={"call_sid": call_sid, "transcription_sid": transcription_sid, "twilio_transcription_url": transcription_url}
        # )
        print(f"💾 LOGGING FOR OUTREACH [{final_outreach_id}]: Transcript received. Ready to be added to conversation history.")

    elif transcription_status == 'failed':
        print(f"❌ Transcription failed for {final_outreach_id} (CallSid: {call_sid}). Error: {request.form.get('ErrorCode')} - {request.form.get('ErrorMessage')}")

    return "", 200 # Twilio expects a 200 OK

# --- NEW TwiML Endpoint for Agent's Turn ---
@app.route("/api/voice/agent_turn_twiml", methods=['POST'])
def agent_turn_twiml():
    response = VoiceResponse()
    outreach_id = request.args.get('outreach_id', 'unknown_outreach')
    ai_audio_url = request.args.get('ai_audio_url')
    ai_message_text = request.args.get('ai_message_text') # Fallback if audio URL not present

    print(f"📢 [AgentTurn] For OutreachID {outreach_id}. AudioURL: {ai_audio_url}, MessageText: {ai_message_text[:50] if ai_message_text else 'N/A'}")

    if ai_audio_url:
        response.play(ai_audio_url)
    elif ai_message_text:
        response.say(ai_message_text, voice='alice', language='en-US')
    else:
        response.say("I'm sorry, I encountered an issue and have nothing to say at the moment. Please try again later.", voice='alice', language='en-US')
        response.hangup()
        return str(response), 200, {'Content-Type': 'text/xml'}

    # Gather user's speech
    gather_action_url = f"{os.getenv('BACKEND_PUBLIC_URL').rstrip('/')}/api/voice/handle_user_speech?outreach_id={outreach_id}"
    gather = Gather(input='speech', speechTimeout='auto', speechModel='phone_call', action=gather_action_url, method='POST')
    # You can add a prompt within <Gather> if needed, e.g., gather.say("What are your thoughts?")
    # If no prompt is given, Twilio waits silently.
    response.append(gather)

    # If Gather completes without input (e.g., user hangs up or silence)
    # Twilio will execute TwiML verbs after <Gather>
    # We can redirect to let the agent try again or end the call.
    # For now, a simple message and hangup if gather fails to get input.
    response.say("We didn't catch your response. Goodbye.", voice='alice', language='en-US')
    response.hangup()
    
    return str(response), 200, {'Content-Type': 'text/xml'}

# --- NEW Endpoint to Handle User's Speech (from Gather) ---
@app.route("/api/voice/handle_user_speech", methods=['POST'])
def handle_user_speech():
    call_sid = request.form.get('CallSid')
    outreach_id = request.args.get('outreach_id', call_sid or 'unknown_outreach')
    user_speech_text = request.form.get('SpeechResult')
    
    print(f"💬 [UserSpeech] For CallSID {call_sid} (OutreachID {outreach_id}). User said: '{user_speech_text}'")

    # Ensure artifact store is initialized for this call_sid
    if call_sid not in call_artifacts_store:
        call_artifacts_store[call_sid] = {
            'outreach_id': outreach_id,
            'conversation_history': [],
        }
    
    # Add user's speech to conversation history
    if user_speech_text:
        call_artifacts_store[call_sid]['conversation_history'].append({
            'speaker': 'user',
            'text': user_speech_text
        })
    else: # Handle case where SpeechResult might be empty/None
        print("⚠️ [UserSpeech] No SpeechResult received from Gather.")
        # Potentially add a "silence" or "no input" marker to history
        call_artifacts_store[call_sid]['conversation_history'].append({
            'speaker': 'user',
            'text': '[No speech detected]'
        })

    # --- AI Response Logic (Step 1: Simple Echo + Predefined) ---
    if user_speech_text:
        ai_response_text = f"I heard you say: \"{user_speech_text}\". I am a simple bot for now. What else can I help you with?"
    else:
        ai_response_text = "I didn't catch that. Could you please repeat?"
    
    print(f"🤖 [AIResponseSimple] AI intends to say: {ai_response_text[:60]}...")

    # Generate audio for AI's response
    next_ai_audio_url, temp_ai_audio_path = generate_audio_with_elevenlabs(ai_response_text, call_sid)
    # temp_ai_audio_path can be tracked for later cleanup if needed

    # Add AI's response to conversation history
    call_artifacts_store[call_sid]['conversation_history'].append({
        'speaker': 'ai',
        'text': ai_response_text,
        'audio_url': next_ai_audio_url # Store AI's audio URL
    })
    
    # --- Prepare TwiML to Redirect back to agent_turn_twiml ---
    response = VoiceResponse()
    from urllib.parse import urlencode
    
    twiml_params = {"outreach_id": outreach_id}
    if next_ai_audio_url:
        twiml_params['ai_audio_url'] = next_ai_audio_url
    else: # Fallback to Twilio TTS if ElevenLabs failed
        twiml_params['ai_message_text'] = ai_response_text 
        print("⚠️ [AIResponseSimple] ElevenLabs failed for AI response, will use Twilio TTS via ai_message_text.")

    redirect_url_base = f"{os.getenv('BACKEND_PUBLIC_URL').rstrip('/')}/api/voice/agent_turn_twiml"
    final_redirect_url = f"{redirect_url_base}?{urlencode(twiml_params)}"
    
    print(f"🔁 [UserSpeech] Redirecting to agent's next turn: {final_redirect_url}")
    response.redirect(final_redirect_url, method='POST')
    
    return str(response), 200, {'Content-Type': 'text/xml'}

# --- Route to serve temporary audio files ---
@app.route('/temp_audio/<filename>', methods=['GET'])
def serve_temp_audio(filename):
    try:
        print(f"Attempting to serve {filename} from {TEMP_AUDIO_DIR}.")
        # Ensure the directory path is absolute for send_from_directory
        abs_temp_audio_dir = os.path.abspath(TEMP_AUDIO_DIR)
        print(f"Absolute path for temp_audio_dir: {abs_temp_audio_dir}")

        # Check if file exists right before sending
        file_path = os.path.join(abs_temp_audio_dir, filename)
        if not os.path.exists(file_path):
            print(f"Error: File {filename} does not exist at {file_path} immediately before sending.")
            return jsonify({"error": "File not found at final check"}), 404
        if os.path.getsize(file_path) == 0:
            print(f"Error: File {filename} is empty at {file_path} immediately before sending.")
            return jsonify({"error": "File is empty at final check"}), 404

        response = send_from_directory(abs_temp_audio_dir, filename, as_attachment=False) # Try with as_attachment=False
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        print(f"Serving {filename} from {abs_temp_audio_dir} with no-cache headers. Content-Type will be {response.mimetype}")
        return response
    except FileNotFoundError:
        print(f"Error: FileNotFoundError for {filename} in {TEMP_AUDIO_DIR}.")
        return jsonify({"error": "File not found exception"}), 404
    except Exception as e:
        print(f"Error serving file {filename}: {type(e).__name__} - {e}")
        return jsonify({"error": "Error serving file"}), 500

# --- NEW Endpoint to fetch call artifacts ---
@app.route("/api/voice/call-details", methods=['GET']) # CHANGED: Removed 'OPTIONS' from methods
@token_required # Frontend will call this, so needs auth
def get_call_details():
    # REMOVED: Explicit OPTIONS handling block from within the route function.
    # The @token_required decorator now solely handles OPTIONS preflight for this route.

    # Existing GET logic starts here
    call_sid = request.args.get('call_sid')
    if not call_sid:
        return jsonify({"success": False, "error": "Missing 'call_sid' in request parameters."}), 400

    call_data = call_artifacts_store.get(call_sid)
    if not call_data:
        return jsonify({"success": False, "error": f"Call artifacts not found for call_sid: {call_sid}"}), 404

    # This structure matches what the frontend (NegotiationAgent.tsx) expects
    # when it processes data.details
    return jsonify({
        "success": True,
        "details": { # Match the frontend's expectation of a "details" object
            "call_sid": call_sid,
            "outreach_id": call_data.get('outreach_id'),
            "conversation_history": call_data.get('conversation_history'),
            "full_recording_url": call_data.get('full_recording_url'),
            "full_recording_duration": call_data.get('full_recording_duration'),
            # Include creator_transcript and creator_segment_recording_sid if they might exist
            # from the old one-way flow or if hybrid use is possible.
            # If these are definitively not part of the new call_artifacts_store structure for 2-way calls, 
            # ensure frontend doesn't break if they are missing.
            # For now, let's assume they might not be there for a pure 2-way call.
            "creator_transcript": call_data.get('creator_transcript'), 
            "creator_segment_recording_sid": call_data.get('creator_segment_recording_sid')
        }
    })

# --- NEW Endpoint to check call processing status ---
@app.route('/api/voice/call-progress-status', methods=['GET', 'OPTIONS']) # Add OPTIONS for CORS preflight
@token_required
def get_call_progress_status():
    if request.method == 'OPTIONS':
        response = app.make_response(jsonify(message="OPTIONS request successful for call-progress-status"))
        response.status_code = 200
        return response

    call_sid = request.args.get('call_sid')
    if not call_sid:
        return jsonify({"success": False, "error": "Missing 'call_sid' in request parameters."}), 400

    call_data = call_artifacts_store.get(call_sid)

    if not call_data:
        return jsonify({"success": True, "status": "not_found", "call_sid": call_sid}), 200 # Still success:true, status indicates finding
    
    # Check if the full recording URL is present, which implies processing is complete for artifacts.
    if call_data.get('full_recording_url'):
        return jsonify({
            "success": True, 
            "status": "completed", 
            "call_sid": call_sid,
            "outreach_id": call_data.get('outreach_id')
        }), 200
    else:
        return jsonify({
            "success": True, 
            "status": "processing", 
            "call_sid": call_sid,
            "outreach_id": call_data.get('outreach_id')
        }), 200

if __name__ == '__main__':
    app.run(debug=True, port=int(os.getenv('PORT', 5001))) # Use PORT from env if available