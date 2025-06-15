from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS # Import CORS
from dotenv import load_dotenv
import os
import signal
import requests
import json
import pdfplumber
import docx # CORRECTED IMPORT
from werkzeug.utils import secure_filename
from functools import wraps # For decorator
from supabase import create_client, Client # Supabase client
from datetime import datetime, timedelta, timezone # Added timezone
import re # For date validation

# Import Twilio and ElevenLabs
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Say, Play, Record, Gather, Stream, Connect
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
            user_response = supabase_client.auth.get_user(token)
            print(f"🔑 Token validated for user: {user_response.user.id if user_response and user_response.user else 'Unknown'}")
            request.current_user = user_response.user
            request.raw_jwt = token # Store raw token on request
        except Exception as e:
            print(f"❌ Token validation error: {e}")
            return jsonify({"success": False, "error": f"Invalid or expired token: {e}"}), 401
        
        return f(*args, **kwargs)
    return decorated_function

# --- Campaign Requirement Extraction Helpers --- START ---

def build_document_extraction_prompt(text_content: str) -> str:
    """
    Builds the prompt for the LLM to extract campaign requirements from document text.
    """
    json_structure_example = {
        "brand_name": "string (e.g., 'EcoFresh Juices') or null",
        "product_service_name": "string (e.g., 'Organic Cold-Pressed Juice Subscription'). If multiple distinct products or services are listed, provide them as a comma-separated string (e.g., 'Product A, Product B, Service X'). or null",
        "industry": ["list of strings (e.g., [\"Technology\", \"Fashion\"])", "or empty list []"],
        "campaign_objectives": ["list of strings (e.g., [\"Increase brand awareness\", \"Drive trial subscriptions\"])", "or empty list []"],
        "target_audience_description": "string (detailed description of the ideal customer, demographics, interests) or null",
        "key_message_points": ["list of strings (main selling points or messages to convey) or empty list []"],
        "influencer_type_preference": ["list of strings (e.g., 'Food bloggers', 'Wellness influencers', 'Fitness trainers') or empty list [] or 'Any'"],
        "platform_preferences": ["list of strings (e.g., 'Instagram', 'YouTube', 'TikTok') or empty list [] or 'Any'"],
        "budget_indication": "string (e.g., 'Approximately $1000-$5000 total', 'Flexible', 'Up to $200 per influencer') or null",
        "timeline_indication": "string (e.g., 'Campaign to run for 6 weeks starting next month', 'Q3 launch') or null",
        "deliverables_examples": ["list of strings (e.g., '2 Instagram posts, 4 stories per influencer', '1 dedicated YouTube video') or empty list []"],
        "tone_of_voice": "string (e.g., 'Fun and energetic', 'Informative and trustworthy', 'Aspirational and premium') or null",
        "negative_keywords_exclusions": ["list of strings (topics, words, or competitors to avoid) or empty list []"],
        "other_notes_or_mandatories": "string (any other specific requirements, do's/don'ts, or mandatory inclusions) or null"
    }

    prompt = f"""
You are an expert campaign analyst. Your task is to meticulously read the following text extracted from a campaign brief document and identify key campaign requirements.
Extract the information and structure it as a VALID JSON object.
The JSON object MUST strictly follow this structure. For any fields where information is not found or cannot be reasonably inferred from the text, use `null` for string fields or an empty list `[]` for list fields.
Do NOT add any fields that are not in this predefined structure.
Ensure your entire output is ONLY the JSON object and nothing else. No introductory text, no explanations, no markdown formatting around the JSON.

JSON Structure to populate:
```json
{json.dumps(json_structure_example, indent=2)}
```

Now, analyze the following text content and extract the campaign requirements:

--- DOCUMENT TEXT ---
{text_content}
--- END OF DOCUMENT TEXT ---

Your output must be a single, valid JSON object.
"""
    return prompt

def extract_campaign_details_with_llm(text_content: str): # Synchronous function
    """
    Uses Groq LLM to extract structured campaign requirements from text.
    Returns a dictionary with keys "success" (boolean) and either "data" (dict) or "error" (str).
    Uses requests.post directly, consistent with other Groq calls in this file.
    """
    global groq_api_key # Use the global groq_api_key loaded from .env
    if not groq_api_key:
        print("❌ Groq API key not available for campaign detail extraction.")
        return {"success": False, "error": "Groq API key not configured on backend."}

    system_prompt = "You are an AI assistant specialized in extracting structured information from text according to a specified JSON format. Output only the JSON object."
    user_prompt = build_document_extraction_prompt(text_content)
    
    print("🧠 Calling Groq LLM (via requests.post) for campaign detail extraction...")
    
    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama3-70b-8192", # Or your preferred Groq model
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1, # Low temperature for more deterministic extraction
        "max_tokens": 2048 # Ensure enough tokens for potentially large JSON
    }
    
    response_content = None # Initialize to ensure it's defined for the except block
    try:
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)
        
        ai_response_data = response.json()
        
        if not ai_response_data.get('choices') or not ai_response_data['choices'][0].get('message') or \
           not ai_response_data['choices'][0]['message'].get('content'):
            print(f"❌ Groq API response missing expected content structure. Response: {ai_response_data}")
            return {"success": False, "error": "LLM response structure invalid."}
            
        response_content = ai_response_data['choices'][0]['message']['content']
        
        print(f"💬 LLM Raw Response (first 300 chars): {response_content[:300]}")
        
        json_response_cleaned = response_content.strip()
        if json_response_cleaned.startswith("```json"):
            json_response_cleaned = json_response_cleaned[7:]
        if json_response_cleaned.endswith("```"):
            json_response_cleaned = json_response_cleaned[:-3]
        json_response_cleaned = json_response_cleaned.strip()
        
        extracted_data = json.loads(json_response_cleaned)
        print("✅ Successfully parsed LLM JSON response for campaign details.")
        return {"success": True, "data": extracted_data}

    except requests.exceptions.HTTPError as http_err:
        error_details = f"HTTP error occurred: {http_err}."
        try:
            # Try to get more details from the response body if it's JSON
            error_body = http_err.response.json()
            error_details += f" Details: {error_body.get('error', {}).get('message', 'No specific error message in JSON.')}"
        except ValueError: # If response body is not JSON
            error_details += f" Response text: {http_err.response.text[:200]}" # Log first 200 chars
        print(f"❌ Groq API call failed: {error_details}")
        return {"success": False, "error": f"LLM API call failed. {error_details}"}
    except requests.exceptions.RequestException as req_err:
        print(f"❌ Groq API request failed: {req_err}")
        return {"success": False, "error": f"LLM API request failed: {str(req_err)}"}
    except json.JSONDecodeError as e:
        error_message = f"Error decoding LLM JSON response: {str(e)}. Response snippet: {response_content[:300] if response_content else 'None'}"
        print(f"❌ {error_message}")
        return {"success": False, "error": "Failed to parse LLM response as JSON.", "raw_response_snippet": response_content[:300] if response_content else 'None'}
    except Exception as e:
        print(f"❌ Error during Groq API call or processing for campaign extraction: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": f"LLM API call or processing failed: {str(e)}"}

# --- Campaign Requirement Extraction Helpers --- END ---
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

# NEW FUNCTION START
def build_live_voice_negotiation_prompt(call_sid):
    call_data = call_artifacts_store.get(call_sid)
    if not call_data:
        print(f"❌ build_live_voice_negotiation_prompt: No call_data found for SID {call_sid}")
        return None

    creator_name = call_data.get('creator_name', 'the creator')
    brand_name = call_data.get('brand_name', 'our company')
    campaign_objective = call_data.get('campaign_objective', 'discuss a potential collaboration')
    live_call_history_list = call_data.get('conversation_history', [])
    # Retrieve the stored email summary
    email_summary = call_data.get('email_conversation_summary', "No prior email conversation summary available.")

    # Format live call conversation history
    formatted_live_call_history = ""
    if not live_call_history_list:
        formatted_live_call_history = "The live call has just started."
    else:
        history_lines = []
        for turn in live_call_history_list:
            speaker = f"You (AI Agent)" if turn.get('speaker') == 'ai' else f"{creator_name} (User)"
            text = turn.get('text', '[speech not transcribed]')
            history_lines.append(f"{speaker}: {text}")
        formatted_live_call_history = "\\n".join(history_lines)

    email_context_section = ""
    # Check if email_summary has meaningful content before including it
    if email_summary and email_summary.strip() and \
       email_summary not in ["No prior email conversation summary available.", "No prior email conversation summary provided."]:
        email_context_section = f'''
PREVIOUS EMAIL CONVERSATION SUMMARY:
{email_summary}
---
'''

    # Construct the main prompt using standard multi-line f-string
    prompt = f'''You are a friendly, professional, and highly skilled AI negotiation agent representing {brand_name}.
Your primary goal is to engage {creator_name} in a productive voice conversation to {campaign_objective}, building upon any previous email discussions.
{email_context_section}
LIVE CALL CONVERSATION HISTORY SO FAR:
{formatted_live_call_history.strip()}

YOUR TASK:
Based on ALL available context (previous emails and this live call), generate the *next thing you should say* to {creator_name}.
- Refer to the email summary if relevant to bridge the conversation, but focus on the live interaction.
- Keep your response concise (1-2 sentences) and natural for a voice call.
- Actively listen to the user. If their response is unclear, confusing, or off-topic, acknowledge it briefly and gently guide the conversation back towards the campaign objective or seek clarification. Example: "I see. To help me understand better, could you tell me more about [relevant aspect]?" or "That's interesting. Coming back to our discussion about [campaign objective], what are your initial thoughts on...?"
- Proactively steer the conversation towards achieving the {campaign_objective}. Don't just ask questions; also offer brief, relevant information about the potential collaboration when appropriate.
- If the user asks a question, answer it directly if possible. If you don't know the answer, politely say so and offer to find out.
- Maintain a positive and engaging tone.
- Do NOT use any special characters, markdown, or formatting. Output only the plain text of your spoken response.

Your response:'''
    
    return prompt
# NEW FUNCTION END

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
    # MODIFIED: Handle industry as a list, join for the prompt or use a default
    industry_list = requirements_data.get('industry', [])
    industry_str = ', '.join(industry_list) if industry_list else '[General Industry]'
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

    prompt = f"""You are an expert campaign strategist. Based on the following business requirements, generate a comprehensive and creative influencer marketing campaign plan.

Business Requirements:
- Company Name: {company_name}
- Industry: {industry_str}  # MODIFIED to use industry_str
- Product/Service: {product_service}
- Business Goals: {business_goals}
- Target Audience: {target_audience}
- Demographics: {demographics}
- Campaign Objective: {campaign_objective}
- Key Message: {key_message}
- Budget Range (Requirement): ₹{budget_min_req}-₹{budget_max_req}
- Timeline: {timeline}
- Preferred Platforms: {preferred_platforms}
- Content Types: {content_types}
- Special Requirements: {special_requirements}

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
    
    industry_value = requirements_data.get('industry', 'General') # This can be a list or a string
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
    
    first_industry_niche = 'general' # Default niche
    if isinstance(industry_value, list) and industry_value:
        # If industry_value is a non-empty list, take the first item, ensure it's a string, then lowercase
        first_industry_niche = str(industry_value[0]).lower()
    elif isinstance(industry_value, str):
        # If industry_value is a string, lowercase it
        first_industry_niche = industry_value.lower()
    # If industry_value is an empty list or another type, 'general' (default) will be used.

    # Create niches list, ensuring 'lifestyle' is present and avoiding duplicates
    niches = list(set([first_industry_niche, 'lifestyle']))

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

# NEW HELPER: Validate date strings or return None if placeholder/invalid
def validate_date_string(date_str):
    if not date_str or not isinstance(date_str, str):
        return None
    # Check for placeholder like YYYY-MM-DD or other non-date patterns from AI
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        # If it doesn't strictly match YYYY-MM-DD, consider it invalid for DB insert
        # This handles cases like "Next month", "Q3", "YYYY-MM-DD", etc.
        return None
    try:
        # Attempt to parse to ensure it's a valid date format that Supabase can handle
        datetime.strptime(date_str, '%Y-%m-%d')
        return date_str
    except ValueError:
        # If strptime fails, it's not a valid date in the expected format
        return None

# MODIFIED HELPER: Save campaign to Supabase - will be modified in next step
def save_campaign_to_db(campaign_payload, user_id, original_requirements, raw_jwt_token): # raw_jwt_token is now passed
    # Ensure supabase_client and its postgrest component are available
    if not supabase_client or not hasattr(supabase_client, 'postgrest'):
        error_message = "Supabase client or postgrest interface not available."
        print(f"❌ {error_message}")
        return {"success": False, "error": error_message, "data": None}

    # Prepare the payload for the 'campaigns' table
    # (Existing payload preparation logic remains the same)
    # ...

    db_payload = {
        "user_id": str(user_id),  # Ensure user_id is a string, matching auth.uid() type if it's text, or cast in policy
        "title": campaign_payload.get("title"),
        "brand": campaign_payload.get("brand"),
        "description": campaign_payload.get("description"),
        "brief": campaign_payload.get("brief"),
        "status": "active",  # AI campaigns default to 'active'
        "creation_method": "ai", # Mark as AI created
        "platforms": campaign_payload.get("platforms"),
        "min_followers": campaign_payload.get("minFollowers") or campaign_payload.get("min_followers"),
        "niches": campaign_payload.get("niches"),
        "locations": campaign_payload.get("locations"),
        "deliverables": campaign_payload.get("deliverables"),
        "budget_min": campaign_payload.get("budgetMin") or campaign_payload.get("budget_min"),
        "budget_max": campaign_payload.get("budgetMax") or campaign_payload.get("budget_max"),
        "start_date": validate_date_string(campaign_payload.get("startDate") or campaign_payload.get("start_date")),
        "end_date": validate_date_string(campaign_payload.get("endDate") or campaign_payload.get("end_date")),
        "application_deadline": validate_date_string(campaign_payload.get("applicationDeadline") or campaign_payload.get("application_deadline")),
        "ai_insights": campaign_payload.get("aiInsights") or campaign_payload.get("ai_insights"),
        "confidence": campaign_payload.get("confidence"),
        # Fields from original_requirements (ensure these keys exist in your requirements_data)
        'company_name': original_requirements.get('companyName'), 
        'product_service_name': original_requirements.get('productService'),
        'campaign_objective': original_requirements.get('campaignObjective'),
        'target_audience': original_requirements.get('targetAudience'),
        'key_message': original_requirements.get('keyMessage'),
        # created_at and updated_at will be set by Supabase default or triggers if defined,
        # otherwise we can set them here if needed like in the other create endpoint
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    print(f"💾 DEBUG: Preparing to insert into Supabase. User ID for insert: {user_id}")
    print(f"💾 DEBUG: Full db_payload for Supabase insert: {json.dumps(db_payload, indent=2, default=str)}")
    
    if not raw_jwt_token:
        print("🟡 DEBUG: Raw JWT token is MISSING in save_campaign_to_db. RLS will rely on default client auth if policy needs user context.")

    # Store the current headers of the PostgREST client session
    # This is crucial to restore the client's auth state (e.g., service role key) afterwards
    original_postgrest_headers = supabase_client.postgrest.session.headers.copy()

    try:
        if raw_jwt_token:
            print(f"💾 DEBUG: Temporarily setting PostgREST auth to user's JWT for RLS. Token snippet: {raw_jwt_token[:20]}...")
            # This sets the Authorization: Bearer <user_jwt> header for the PostgREST client
            supabase_client.postgrest.auth(raw_jwt_token)
        else:
            # If no JWT, the client will use its default authentication (e.g., service role key)
            # RLS policies checking auth.uid() might fail if they expect a user context not provided by the service key alone.
            print("💾 DEBUG: Proceeding with default PostgREST client authentication (e.g., service key).")

        print(f"💾 DEBUG: Attempting insert. User ID for insert: {user_id}")
        insert_response = supabase_client.table('campaigns').insert(db_payload).execute()
        
        if hasattr(insert_response, 'data') and insert_response.data and len(insert_response.data) > 0:
            saved_campaign_data = insert_response.data[0]
            print(f"✅ Campaign '{saved_campaign_data.get('title')}' (ID: {saved_campaign_data.get('id')}) saved successfully for user {user_id}.")
            return {"success": True, "data": saved_campaign_data, "error": None}
        else:
            error_msg = "Campaign data not returned from DB after insert."
            # Attempt to get more specific error from PostgREST response
            if hasattr(insert_response, 'error') and insert_response.error:
                 error_details = getattr(insert_response.error, 'message', str(insert_response.error))
                 error_code = getattr(insert_response.error, 'code', 'N/A')
                 error_hint = getattr(insert_response.error, 'hint', 'N/A')
                 error_msg += f" Supabase error (Code: {error_code}, Hint: {error_hint}): {error_details}"
            elif hasattr(insert_response, 'status_code') and insert_response.status_code >= 400:
                 error_msg += f" HTTP Status: {insert_response.status_code}. Response: {getattr(insert_response, 'text', str(insert_response))[:200]}"

            print(f"❌ {error_msg} Raw Response: {insert_response}")
            return {"success": False, "error": error_msg, "data": None}

    except Exception as e:
        error_message = f"Error saving campaign to Supabase: {type(e).__name__} - {str(e)}"
        print(f"❌ {error_message}")
        import traceback
        traceback.print_exc() # Print full traceback for debugging
        return {"success": False, "error": error_message, "data": None}
    finally:
        # CRITICAL: Restore the original headers to the PostgREST client
        # This ensures the global client reverts to its original authentication state (e.g., service role)
        print("💾 DEBUG: Restoring original PostgREST client session headers.")
        supabase_client.postgrest.session.headers = original_postgrest_headers
        # Verify restoration (optional debug log)
        # print(f"💾 DEBUG: Headers restored to: {supabase_client.postgrest.session.headers}")

@app.route('/api/campaign/generate', methods=['POST'])
@token_required # Secure this endpoint
def handle_generate_campaign():
    requirements_data = request.json
    if not requirements_data:
        return jsonify({"success": False, "error": "Missing business requirements in request body."}), 400

    if not hasattr(request, 'current_user') or not request.current_user or not hasattr(request.current_user, 'id') or not hasattr(request, 'raw_jwt'):
        print("🔴 Current user or raw_jwt not found in request for handle_generate_campaign.") 
        return jsonify({"success": False, "error": "User context or token not available for campaign generation."}), 401
        
    current_user_id = request.current_user.id
    raw_jwt_from_request = request.raw_jwt # Get the raw token
    campaign_to_save = None
    generation_method = "unknown"
    error_during_generation = None

    if not groq_api_key:
        print("🤖 Campaign Agent (Backend): Groq API key not configured. Using fallback campaign strategy.")
        campaign_to_save = generate_fallback_campaign_py(requirements_data)
        generation_method = "algorithmic_fallback_no_api_key"
    else:
        prompt = build_campaign_generation_prompt(requirements_data)
        try:
            print(f"🤖 Campaign Agent (Backend): Making AI API call for campaign generation...")
            headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
            payload = {
                "model": "llama3-70b-8192", 
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 2000
            }
            response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            ai_response_data = response.json()
            ai_message_content = ai_response_data['choices'][0]['message']['content']
            try:
                json_str = ai_message_content 
                json_start_index = ai_message_content.find('{')
                json_end_index = ai_message_content.rfind('}')
                if json_start_index != -1 and json_end_index != -1 and json_start_index < json_end_index:
                    json_str = ai_message_content[json_start_index : json_end_index + 1]
                else:
                    if not (ai_message_content.strip().startswith("{") and ai_message_content.strip().endswith("}")):
                        raise ValueError("Could not find a valid JSON block in AI response (no clear braces).")
                    json_str = ai_message_content.strip()
                content = json.loads(json_str)
                if "body" in content and "message" not in content: content["message"] = content.pop("body")
                if not all(k in content for k in ["title", "brand", "description", "platforms"]):
                    raise ValueError("AI campaign response JSON missing required keys (title, brand, description, platforms)")
                content['agentVersion'] = 'campaign-builder-py-v1.1'
                content['generatedAt'] = datetime.now(timezone.utc).isoformat()
                if 'confidence' not in content: content['confidence'] = 0.85
                print(f"✨ Campaign Agent (Backend): AI campaign generated successfully: {content.get('title')}")
                campaign_to_save = content
                generation_method = "ai_generated"
            except (json.JSONDecodeError, ValueError) as e_parse:
                error_msg = f"Error parsing AI campaign JSON response: {e_parse}. Raw (first 500 chars): {ai_message_content[:500]}"
                print(error_msg)
                error_during_generation = error_msg 
                campaign_to_save = generate_fallback_campaign_py(requirements_data)
                generation_method = "algorithmic_fallback_after_parse_error"
        except requests.exceptions.RequestException as e_req:
            error_msg = f"Groq API request failed for campaign generation: {e_req}"
            print(error_msg)
            error_during_generation = error_msg
            campaign_to_save = generate_fallback_campaign_py(requirements_data)
            generation_method = "algorithmic_fallback_after_api_error"
        except Exception as e_gen:
            error_msg = f"An unexpected error occurred during AI campaign generation: {e_gen}"
            print(error_msg)
            import traceback
            traceback.print_exc()
            error_during_generation = error_msg
            campaign_to_save = generate_fallback_campaign_py(requirements_data)
            generation_method = "algorithmic_fallback_after_unexpected_error"

    if campaign_to_save:
        # Pass the raw_jwt_from_request to save_campaign_to_db
        db_save_result = save_campaign_to_db(campaign_to_save, current_user_id, requirements_data, raw_jwt_from_request)
        if db_save_result["success"]:
            response_payload = {
                "success": True, 
                "campaign": db_save_result["data"], 
                "method": generation_method, 
                "message": "Campaign generated and saved successfully."
            }
            if error_during_generation:
                 response_payload["generation_warning"] = error_during_generation
            return jsonify(response_payload), 201
        else:
            return jsonify({
                "success": False, 
                "error": f"Campaign content was generated (method: {generation_method}) but failed to save to database: {db_save_result['error']}",
                "generation_warning": error_during_generation,
                "generated_campaign_data_for_debug": campaign_to_save
            }), 500
    else:
        return jsonify({"success": False, "error": "Critical error: Failed to produce any campaign content to save."}), 500

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
  "confidence": 0.85
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
    creator_data = data['creator']
    brand_info_data = data['brandInfo']
    campaign_context_str = data['campaignContext']

    if not groq_api_key:
        print("🤖 Initial Outreach (Backend): Groq API key missing. Using template fallback.")
        fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback"})

    prompt = build_initial_outreach_prompt_py(creator_data, brand_info_data, campaign_context_str)
    try: # Outer try for the API call and subsequent processing
        print(f"🤖 Initial Outreach (Backend): Calling Groq for {creator_data.get('name', 'N/A')}")
        headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
        payload = {"model": "llama3-70b-8192", "messages": [{"role": "user", "content": prompt}], "temperature": 0.4, "max_tokens": 1000}
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data['choices'][0]['message']['content']
        
        try: # Inner try for JSON parsing
            # More aggressive cleaning: find the first '{' and last '}'
            first_brace = ai_message_content.find('{')
            last_brace = ai_message_content.rfind('}')

            if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
                json_str = ai_message_content[first_brace : last_brace + 1]
            else:
                # If we can't find a clear start and end, the content is likely not usable JSON
                raise ValueError(f"Could not find a valid JSON block (no clear '{{' and '}}' boundaries). Raw content snippet: {ai_message_content[:100]}")
            
            content = json.loads(json_str) # Attempt to parse the extracted string
            
            # Adapt the 'body' field from AI to 'message' for consistent response structure
            if "body" in content and "message" not in content:
                content["message"] = content.pop("body")

            # Basic validation for expected keys after adaptation
            if not all(k in content for k in ["subject", "message"]):
                raise ValueError(f"AI initial outreach response JSON missing required keys (subject, message) after adaptation. Keys found: {list(content.keys())}")
            
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
        import traceback
        traceback.print_exc() 
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
        start_time_tts_api = datetime.now() # Timing start for API call
        
        audio_stream = elevenlabs_client.text_to_speech.stream(
            text=text_to_speak,
            voice_id=elevenlabs_voice_id, 
            model_id="eleven_turbo_v2_5",
            output_format="mp3_44100_32"  # CHANGED for potentially lower latency
        )
        
        filename = f"{call_sid_for_filename}_{uuid.uuid4()}.mp3"
        temp_file_path = os.path.join(TEMP_AUDIO_DIR, filename)
        
        print(f"👂 ElevenLabs: Stream object created. Attempting to save to {temp_file_path}...")
        bytes_written = 0
        start_time_save_file = datetime.now() # Timing start for file save
        with open(temp_file_path, "wb") as f:
            for chunk in audio_stream:
                if chunk:
                    f.write(chunk)
                    bytes_written += len(chunk)
        
        end_time_save_file = datetime.now() # Timing end for file save
        time_taken_save_file = (end_time_save_file - start_time_save_file).total_seconds()
        print(f"👂 ElevenLabs: Finished writing to stream. Total bytes attempted: {bytes_written}. File save took: {time_taken_save_file:.2f}s.")
            
        end_time_tts_api = datetime.now() # Timing end for API call + stream handling
        time_taken_tts_api = (end_time_tts_api - start_time_tts_api).total_seconds()
        print(f"⏱️ ElevenLabs TTS API call & stream handling took: {time_taken_tts_api:.2f}s (includes file write).")

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
        return jsonify({"success": False, "error": "Twilio client not initialized"}), 500

    try:
        data = request.get_json()
        to_phone_number = data.get('to_phone_number')
        initial_message_text = data.get('message') 
        outreach_id = data.get('outreach_id') 
        creator_name = data.get('creator_name', 'Valued Creator') 
        brand_name = data.get('brand_name', 'Our Brand')       
        campaign_objective = data.get('campaign_objective', 'Discuss potential collaboration') 
        # ADDED: Get email conversation summary from the request
        email_conversation_summary = data.get('conversationHistorySummary', "No prior email conversation summary provided.")

        if not to_phone_number or not initial_message_text:
            return jsonify({"success": False, "error": "Missing to_phone_number or message"}), 400
        
        twiml_to_use = None
        temp_audio_public_url = None 
        backend_public_url = os.getenv("BACKEND_PUBLIC_URL", f"http://localhost:{os.getenv('PORT', 5001)}").rstrip('/')
        handle_user_speech_url = f"{backend_public_url}/api/voice/handle_user_speech"
        print(f"DEBUG: handle_user_speech_url in make_outbound_call: {handle_user_speech_url}") # DEBUG LINE ADDED

        if not elevenlabs_client and not elevenlabs_api_key: 
            print("📞 ElevenLabs client/key not available, using Twilio basic TTS for initial message.")
            response = VoiceResponse()
            response.say(initial_message_text, voice='alice')
            gather = Gather(input='speech', action=handle_user_speech_url, method='POST', speechTimeout='auto')
            response.append(gather)
            response.say("We didn't catch that. Could you please repeat?", voice='alice') 
            response.hangup() 
            twiml_to_use = str(response)
        else:
            try:
                generated_url, _ = generate_audio_with_elevenlabs(initial_message_text, call_sid_for_filename=f"initial_{outreach_id or 'ad_hoc'}")
                temp_audio_public_url = generated_url 
                
                if not temp_audio_public_url:
                    raise Exception("ElevenLabs audio generation failed to return a URL.")

                response = VoiceResponse()
                response.play(temp_audio_public_url) 
                gather = Gather(input='speech', action=handle_user_speech_url, method='POST', speechTimeout='auto')
                response.append(gather)
                response.say("We didn't catch that. Could you please repeat?", voice='alice')
                response.hangup()
                twiml_to_use = str(response)

            except Exception as e_elevenlabs:
                print(f"❌ ElevenLabs TTS usage or subsequent TwiML construction failed: {e_elevenlabs}. Falling back to Twilio basic TTS for initial message.")
                response = VoiceResponse()
                response.say(initial_message_text, voice='alice')
                gather = Gather(input='speech', action=handle_user_speech_url, method='POST', speechTimeout='auto')
                response.append(gather)
                response.say("We didn't catch that. Could you please repeat?", voice='alice')
                response.hangup()
                twiml_to_use = str(response)
                temp_audio_public_url = None 

        call = twilio_client.calls.create(
            twiml=twiml_to_use,
            to=to_phone_number,
            from_=twilio_phone_number,
            status_callback=f'{backend_public_url}/api/voice/recording-status',
            status_callback_event=['completed'],
            record=True,
        )

        call_sid = call.sid
        print(f"📞 Call initiated with SID: {call_sid} to {to_phone_number}. Outreach ID: {outreach_id}")

        call_artifacts_store[call_sid] = {
            "status": "initiated", 
            "outreach_id": outreach_id,
            "initial_message_text": initial_message_text,
            "creator_name": creator_name, 
            "brand_name": brand_name,     
            "campaign_objective": campaign_objective, 
            "email_conversation_summary": email_conversation_summary, # ADDED: Store the summary
            "conversation_history": [
                {"speaker": "ai", "text": initial_message_text, "timestamp": datetime.now(timezone.utc).isoformat()}
            ], 
            "temp_initial_audio_url": temp_audio_public_url 
        }
        
        return jsonify({"success": True, "call_sid": call_sid, "status": "initiated", "message": "Call initiated successfully."})

    except Exception as e:
        print(f"Error in make_outbound_call: {e}")
        import traceback
        traceback.print_exc()
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
    print("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print("!!! HANDLE_USER_SPEECH ENDPOINT ENTERED !!!")
    request_received_time = datetime.now() # Start timing for the whole function
    print(f"!!! Request Form Data: {request.form}")
    print(f"!!! Request Args: {request.args}")
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n")
    
    call_sid = request.form.get('CallSid')
    user_speech_text = request.form.get('SpeechResult', '').strip()
    speech_confidence = float(request.form.get('Confidence', 0.0)) # Get confidence
    backend_public_url = os.getenv("BACKEND_PUBLIC_URL", f"http://localhost:{os.getenv('PORT', 5001)}").rstrip('/') 
    handle_user_speech_url = f"{backend_public_url}/api/voice/handle_user_speech" 

    print(f"🎤 User Speech on SID {call_sid}: '{user_speech_text}', Confidence: {speech_confidence}")

    call_data = call_artifacts_store.get(call_sid)
    if not call_data:
        print(f"❌ handle_user_speech: No call_data found for SID {call_sid}. Cannot continue conversation.")
        response = VoiceResponse()
        response.say("I'm sorry, there was an issue retrieving our conversation context. Please try calling back later.", voice='alice')
        response.hangup()
        return str(response), 200, {'Content-Type': 'application/xml'}

    # MODIFICATION START: Handle low confidence
    if speech_confidence < 0.4:
        print(f"👂 handle_user_speech: Low confidence ({speech_confidence}) for SID {call_sid}. User speech '{user_speech_text}' ignored. Asking user to repeat.")
        ai_response_text = "I'm sorry, I didn't catch that clearly. Could you please say that again?"
        
        # Add AI's request to repeat to conversation history for context
        call_data.setdefault('conversation_history', []).append({
            "speaker": "ai", 
            "text": ai_response_text, 
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        temp_ai_audio_url = None
        if elevenlabs_client:
            try:
                generated_url, _ = generate_audio_with_elevenlabs(ai_response_text, call_sid_for_filename=f"ai_repeat_request_{call_sid}")
                temp_ai_audio_url = generated_url
            except Exception as e_elevenlabs:
                print(f"❌ ElevenLabs TTS for repeat request failed for SID {call_sid}: {e_elevenlabs}")
        
        response = VoiceResponse()
        if temp_ai_audio_url:
            response.play(temp_ai_audio_url)
        else:
            response.say(ai_response_text, voice='alice')
        
        gather = Gather(input='speech', action=handle_user_speech_url, method='POST', speechTimeout='auto')
        response.append(gather)
        # Fallback if gather fails
        response.say("Sorry, I still didn't catch that. Goodbye.", voice='alice')
        response.hangup()

        function_end_time = datetime.now()
        total_function_time = (function_end_time - request_received_time).total_seconds()
        print(f"⏱️ Total time for handle_user_speech function (low confidence path): {total_function_time:.2f}s")
        return str(response), 200, {'Content-Type': 'application/xml'}
    # MODIFICATION END

    if user_speech_text:
        call_data.setdefault('conversation_history', []).append({
            "speaker": "user", 
            "text": user_speech_text, 
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    else: # This handles cases where SpeechResult is empty, but not necessarily low confidence for actual speech
        print(f"👂 handle_user_speech: User speech was empty for SID {call_sid} (Confidence was {speech_confidence}). Prompting to repeat.")
        ai_response_text = "Sorry, I didn't catch that. Could you please say it again?"
        
        # Add AI's request to repeat to conversation history
        call_data.setdefault('conversation_history', []).append({
            "speaker": "ai",
            "text": ai_response_text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        temp_ai_audio_url = None
        if elevenlabs_client:
            try:
                generated_url, _ = generate_audio_with_elevenlabs(ai_response_text, call_sid_for_filename=f"ai_empty_speech_repeat_{call_sid}")
                temp_ai_audio_url = generated_url
            except Exception as e_elevenlabs:
                print(f"❌ ElevenLabs TTS for empty speech repeat request failed for SID {call_sid}: {e_elevenlabs}")
        
        response = VoiceResponse()
        if temp_ai_audio_url:
            response.play(temp_ai_audio_url)
        else:
            response.say(ai_response_text, voice='alice')
            
        gather = Gather(input='speech', action=handle_user_speech_url, method='POST', speechTimeout='auto')
        response.append(gather)
        response.say("We didn't catch that. Could you please repeat?", voice='alice') 
        response.hangup()
        
        function_end_time = datetime.now()
        total_function_time = (function_end_time - request_received_time).total_seconds()
        print(f"⏱️ Total time for handle_user_speech function (empty speech path): {total_function_time:.2f}s")
        return str(response), 200, {'Content-Type': 'application/xml'}

    llm_prompt = build_live_voice_negotiation_prompt(call_sid)
    ai_response_text = "I'm having a little trouble formulating a response right now. Could you please repeat what you said?"
    temp_ai_audio_url = None

    if llm_prompt and groq_api_key:
        try:
            print(f"🤖 handle_user_speech: Sending prompt to Groq for SID {call_sid}")
            request_headers = {
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json"
            }
            request_payload = {
                "model": "llama3-8b-8192", # CHANGED MODEL FOR TESTING
                "messages": [{"role": "user", "content": llm_prompt}],
                "temperature": 0.7,
                "max_tokens": 100, # SLIGHTLY REDUCED FOR TESTING
                "top_p": 1,
                "stream": False
            }
            print(f"DEBUG GROQ REQUEST HEADERS: {request_headers}") 
            print(f"DEBUG GROQ REQUEST PAYLOAD: {json.dumps(request_payload, indent=2)}") 

            start_time_groq = datetime.now() # Timing start for Groq call
            groq_response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=request_headers, 
                json=request_payload    
            )
            end_time_groq = datetime.now() # Timing end for Groq call
            time_taken_groq = (end_time_groq - start_time_groq).total_seconds()
            print(f"⏱️ Groq API call took: {time_taken_groq:.2f}s")

            groq_response.raise_for_status() 
            groq_data = groq_response.json()
            
            if groq_data.get('choices') and len(groq_data['choices']) > 0:
                extracted_text = groq_data['choices'][0].get('message', {}).get('content', '').strip()
                if extracted_text:
                    ai_response_text = extracted_text
                    print(f"🤖 LLM Response for SID {call_sid}: '{ai_response_text}'")
                else:
                    print(f"⚠️ LLM response was empty for SID {call_sid}.")
            else:
                print(f"⚠️ LLM response structure unexpected for SID {call_sid}: {groq_data}")
        except requests.exceptions.RequestException as e_groq:
            print(f"❌ Groq API call failed for SID {call_sid}: {e_groq}")
        except Exception as e_json: 
            print(f"❌ Error processing Groq response for SID {call_sid}: {e_json}")
    elif not groq_api_key:
        print("🔴 Groq API key not configured. Using fallback response.")
    else: 
        print(f"🔴 Failed to build LLM prompt for SID {call_sid}. Using fallback response.")

    call_data.setdefault('conversation_history', []).append({
        "speaker": "ai", 
        "text": ai_response_text, 
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    if elevenlabs_client: 
        try:
            generated_url, _ = generate_audio_with_elevenlabs(ai_response_text, call_sid_for_filename=f"ai_turn_{call_sid}")
            temp_ai_audio_url = generated_url 
            if not temp_ai_audio_url:
                print(f"⚠️ ElevenLabs audio generation did not return a URL for SID {call_sid}. Will use Twilio TTS.")
        except Exception as e_elevenlabs:
            print(f"❌ ElevenLabs TTS generation failed for SID {call_sid}: {e_elevenlabs}. Will use Twilio TTS.")
    else:
        print(f"🔊 ElevenLabs client not available. Using Twilio basic TTS for SID {call_sid}.")

    response = VoiceResponse()
    if temp_ai_audio_url:
        response.play(temp_ai_audio_url) 
    else:
        response.say(ai_response_text, voice='alice') 

    gather = Gather(input='speech', action=handle_user_speech_url, method='POST', speechTimeout='auto')
    response.append(gather)
    response.say("I didn't catch that. Could you please say it again?", voice='alice')
    response.hangup()

    function_end_time = datetime.now()
    total_function_time = (function_end_time - request_received_time).total_seconds()
    print(f"⏱️ Total time for handle_user_speech function execution: {total_function_time:.2f}s")

    return str(response), 200, {'Content-Type': 'application/xml'}

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

# NEW ENDPOINT FOR DOCUMENT EXTRACTION
@app.route('/api/campaign/extract_from_document', methods=['POST'])
@token_required
def extract_campaign_from_document(): # REMOVED current_user parameter
    print(f"📄 Entering /api/campaign/extract_from_document endpoint for user: {request.current_user.id if hasattr(request.current_user, 'id') else 'unknown'}") # MODIFIED to use request.current_user
    if 'file' not in request.files:
        print("❌ No file part in request")
        return jsonify({"success": False, "error": "No file part in the request"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        print("❌ No file selected")
        return jsonify({"success": False, "error": "No file selected for uploading"}), 400

    if file:
        # Use secure_filename to prevent directory traversal attacks
        filename = secure_filename(file.filename)
        print(f"📄 Received file: {filename}")
        
        allowed_extensions = {'.pdf', '.docx'}
        file_ext = os.path.splitext(filename)[1].lower()

        if file_ext not in allowed_extensions:
            print(f"❌ Unsupported file type: {file_ext}")
            return jsonify({"success": False, "error": f"Unsupported file type: {file_ext}. Please upload a PDF or DOCX file."}), 400

        extracted_text = ""
        try:
            if file_ext == '.pdf':
                with pdfplumber.open(file.stream) as pdf: # Use file.stream for in-memory processing
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text: # Check if text was extracted
                           extracted_text += page_text + "\n"
                print(f"📄 Successfully extracted text from PDF: {filename}")
            
            elif file_ext == '.docx':
                document = docx.Document(file.stream) # Use file.stream for in-memory processing
                for para in document.paragraphs:
                    extracted_text += para.text + "\n"
                print(f"📄 Successfully extracted text from DOCX: {filename}")

            if not extracted_text.strip():
                 print(f"⚠️ No text could be extracted from {filename}")
                 return jsonify({"success": False, "error": f"No text content could be extracted from the file: {filename}."}), 400

            # TODO: Send extracted_text to LLM for requirement extraction
            # For now, return the extracted text (or a snippet)
            print(f"Extracted text length: {len(extracted_text)}")
            
            # Placeholder for LLM call and structured data response
            # llm_extracted_requirements = call_llm_to_extract_requirements(extracted_text)
            if not extracted_text.strip():
                 print(f"⚠️ No text could be extracted from {filename}")
                 return jsonify({"success": False, "error": f"No text content could be extracted from the file: {filename}. Please ensure the document contains selectable text."}), 400
            
            print(f"Extracted text length: {len(extracted_text)}. Sending to LLM...")

            # Call LLM to extract requirements
            llm_result = extract_campaign_details_with_llm(extracted_text)

            if not llm_result.get("success"):
                return jsonify({
                    "success": False,
                    "error": llm_result.get("error", "LLM processing failed."),
                    "filename": filename,
                    "file_type": file_ext,
                    "raw_llm_response_snippet": llm_result.get("raw_response_snippet") # For debugging
                }), 500

            return jsonify({
                "success": True, 
                "message": f"Successfully extracted campaign requirements from '{filename}'.",
                "filename": filename,
                "file_type": file_ext,
                "structured_requirements": llm_result.get("data")
            }), 200
            

        except Exception as e:
            print(f"❌ Error processing file {filename}: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({"success": False, "error": f"Error processing file: {str(e)}"}), 500
    
    return jsonify({"success": False, "error": "An unknown error occurred with the file upload"}), 500

# NEW ENDPOINT TO LIST ALL CAMPAIGNS
@app.route('/api/campaigns', methods=['GET'])
@token_required
def list_campaigns():
    if not supabase_client or not hasattr(supabase_client, 'postgrest'):
        print("🔴 Supabase client or postgrest interface not available for list_campaigns.")
        return jsonify({"success": False, "error": "Supabase client not configured."}), 500

    if not hasattr(request, 'current_user') or not request.current_user or not hasattr(request.current_user, 'id') or not hasattr(request, 'raw_jwt'):
        print("🔴 Current user or raw_jwt not found in request for list_campaigns.")
        return jsonify({"success": False, "error": "User context or token not available."}), 401
        
    current_user_id = request.current_user.id
    raw_jwt_token = request.raw_jwt # Get the raw token from the request object populated by @token_required
    
    print(f"ℹ️ Fetching campaigns for user_id: {current_user_id}. JWT is {'present' if raw_jwt_token else 'MISSING'}.")

    # Store the current headers of the PostgREST client session
    original_postgrest_headers = supabase_client.postgrest.session.headers.copy()

    try:
        if raw_jwt_token:
            print(f"💾 DEBUG: list_campaigns - Temporarily setting PostgREST auth to user's JWT. Snippet: {raw_jwt_token[:20]}...")
            supabase_client.postgrest.auth(raw_jwt_token) # Set current request to use user's JWT
        else:
            # This case should ideally not happen if @token_required is working and RLS needs auth.uid()
            print("⚠️ WARNING: list_campaigns - No raw_jwt_token available. RLS policies using auth.uid() may not work as expected.")

        campaigns_response = supabase_client.table('campaigns') \
                                .select('id, title, brand, description, status, budget_min, budget_max, application_deadline, start_date, end_date, platforms, niches, deliverables, min_followers, locations, ai_insights, user_id, created_at, creation_method') \
                                .eq('user_id', current_user_id) \
                                .order('created_at', desc=True) \
                                .execute()

        # ADDED DEBUGGING: Print the raw response from Supabase
        print(f"💾 DEBUG: Raw Supabase response in list_campaigns: {campaigns_response}")
        # You can also log specific parts like campaigns_response.data if you want to inspect it directly
        if hasattr(campaigns_response, 'data'):
            print(f"💾 DEBUG: campaigns_response.data in list_campaigns: {campaigns_response.data}")
        if hasattr(campaigns_response, 'error') and campaigns_response.error: # Check if error is not None
            print(f"💾 DEBUG: campaigns_response.error in list_campaigns: {campaigns_response.error}")

        fetched_campaigns = []
        if hasattr(campaigns_response, 'data') and campaigns_response.data:
            fetched_campaigns = campaigns_response.data
        
        if not fetched_campaigns:
            print(f"ℹ️ No campaigns found for user {current_user_id} or campaigns_response.data was empty/None.")
            # It's important to return success:true here as per frontend expectation for empty list
            return jsonify({"success": True, "campaigns": []})

        # Transform data to match frontend's expected nested structure
        transformed_campaigns = []
        for campaign_row in fetched_campaigns:
            transformed = {
                "id": campaign_row.get('id'),
                "title": campaign_row.get('title'),
                "brand": campaign_row.get('brand'),
                "description": campaign_row.get('description'),
                "status": campaign_row.get('status'),
                "creation_method": campaign_row.get('creation_method'), # Added creation_method
                "budget": {
                    "min": campaign_row.get('budget_min'),
                    "max": campaign_row.get('budget_max')
                },
                "timeline": {
                    "applicationDeadline": campaign_row.get('application_deadline'),
                    "startDate": campaign_row.get('start_date'),
                    "endDate": campaign_row.get('end_date')
                },
                "requirements": {
                    "platforms": campaign_row.get('platforms', []), 
                    "minFollowers": campaign_row.get('min_followers'),
                },
                "platforms": campaign_row.get('platforms', []), 
                "niches": campaign_row.get('niches', []),
                "deliverables": campaign_row.get('deliverables', []),
                "locations": campaign_row.get('locations', []),
                "min_followers": campaign_row.get('min_followers'), 
                "ai_insights": campaign_row.get('ai_insights'),
                "user_id": campaign_row.get('user_id'),
                "created_at": campaign_row.get('created_at'),
                "applicants": campaign_row.get('applicants', 0), 
                "selected": campaign_row.get('selected', 0)    
            }
            transformed_campaigns.append(transformed)
        
        print(f"✅ Fetched and transformed {len(transformed_campaigns)} campaigns for user {current_user_id}. Now including creation_method.")
        return jsonify({"success": True, "campaigns": transformed_campaigns})

    except Exception as e:
        error_message = f"Error fetching campaigns from Supabase: {type(e).__name__} - {str(e)}"
        print(f"❌ {error_message}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": error_message}), 500
    finally:
        # CRITICAL: Restore the original headers to the PostgREST client
        print("💾 DEBUG: list_campaigns - Restoring original PostgREST client session headers.")
        supabase_client.postgrest.session.headers = original_postgrest_headers

# NEW ENDPOINT TO GET A SINGLE CAMPAIGN BY ID
@app.route('/api/campaigns/<campaign_id>', methods=['GET'])
@token_required
def get_campaign_by_id(campaign_id):
    if not supabase_client or not hasattr(supabase_client, 'postgrest'):
        print("🔴 Supabase client or postgrest interface not available for get_campaign_by_id.")
        return jsonify({"success": False, "error": "Supabase client not configured."}), 500

    if not hasattr(request, 'current_user') or not request.current_user or not hasattr(request.current_user, 'id') or not hasattr(request, 'raw_jwt'):
        print("🔴 Current user or raw_jwt not found in request for get_campaign_by_id.")
        return jsonify({"success": False, "error": "User context or token not available."}), 401
        
    current_user_id = request.current_user.id
    raw_jwt_token = request.raw_jwt

    print(f"ℹ️ Fetching campaign with id: {campaign_id} for user_id: {current_user_id}. JWT is {'present' if raw_jwt_token else 'MISSING'}.")

    original_postgrest_headers = supabase_client.postgrest.session.headers.copy()

    try:
        if raw_jwt_token:
            print(f"💾 DEBUG: get_campaign_by_id - Temporarily setting PostgREST auth to user's JWT. Snippet: {raw_jwt_token[:20]}...")
            supabase_client.postgrest.auth(raw_jwt_token)
        else:
            print("⚠️ WARNING: get_campaign_by_id - No raw_jwt_token available. RLS policies using auth.uid() may not work as expected.")

        # CORRECTED: Using parentheses for implicit line continuation for the Supabase query
        # This should resolve the SyntaxError: unexpected character after line continuation character
        campaign_response = (supabase_client.table('campaigns')
                                .select('id, title, brand, description, brief, status, budget_min, budget_max, application_deadline, start_date, end_date, platforms, niches, deliverables, min_followers, locations, ai_insights, user_id, created_at')
                                .eq('id', campaign_id)
                                .eq('user_id', current_user_id)
                                .maybe_single()
                                .execute())

        print(f"💾 DEBUG: Raw Supabase response in get_campaign_by_id: {campaign_response}")
        if hasattr(campaign_response, 'data') and campaign_response.data:
            print(f"💾 DEBUG: campaign_response.data in get_campaign_by_id: {campaign_response.data}")
        if hasattr(campaign_response, 'error') and campaign_response.error:
            print(f"💾 DEBUG: campaign_response.error in get_campaign_by_id: {campaign_response.error}")


        campaign_row = None
        if hasattr(campaign_response, 'data') and campaign_response.data:
            campaign_row = campaign_response.data
        
        if not campaign_row:
            print(f"ℹ️ Campaign with id {campaign_id} not found for user {current_user_id} or response data was empty.")
            return jsonify({"success": False, "error": "Campaign not found or not authorized."}), 404

        # Transform data to match the detailed nested structure expected by the frontend
        transformed_campaign = {
            "id": campaign_row.get('id'),
            "title": campaign_row.get('title'),
            "brand": campaign_row.get('brand'),
            "description": campaign_row.get('description'),
            "brief": campaign_row.get('brief'), 
            "status": campaign_row.get('status'),
            "budget": {
                "min": campaign_row.get('budget_min'),
                "max": campaign_row.get('budget_max')
            },
            "timeline": {
                "applicationDeadline": campaign_row.get('application_deadline'),
                "startDate": campaign_row.get('start_date'),
                "endDate": campaign_row.get('end_date')
            },
            "requirements": { 
                "platforms": campaign_row.get('platforms', []),
                "minFollowers": campaign_row.get('min_followers'),
                "niches": campaign_row.get('niches', []), 
                "locations": campaign_row.get('locations', []), 
                "deliverables": campaign_row.get('deliverables', []) 
            },
            # Storing ai_insights directly as it's already an object
            "aiInsights": campaign_row.get('ai_insights'), 
            "userId": campaign_row.get('user_id'), 
            "createdAt": campaign_row.get('created_at'),
            # These might not be directly on the campaign row but could be calculated or joined in the future
            "applicants": campaign_row.get('applicants', 0), 
            "selected": campaign_row.get('selected', 0)    
        }
        
        print(f"✅ Fetched and transformed campaign with id {campaign_id} for user {current_user_id}.")
        return jsonify({"success": True, "campaign": transformed_campaign})

    except Exception as e:
        error_message = f"Error fetching campaign {campaign_id} from Supabase: {type(e).__name__} - {str(e)}"
        print(f"❌ {error_message}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": error_message}), 500
    finally:
        print(f"💾 DEBUG: get_campaign_by_id - Restoring original PostgREST client session headers for campaign_id: {campaign_id}.")
        supabase_client.postgrest.session.headers = original_postgrest_headers

# NEW ENDPOINT TO UPDATE A CAMPAIGN
@app.route('/api/campaigns/<campaign_id>', methods=['PUT'])
@token_required
def update_campaign_by_id(campaign_id):
    if not supabase_client:
        return jsonify({"success": False, "error": "Supabase client not initialized."}), 500

    current_user_id = request.current_user.id
    data = request.json
    if not data:
        return jsonify({"success": False, "error": "No data provided for update."}), 400

    # Fields that can be updated by the user for a 'human' campaign
    allowed_fields = [
        "title", "brand", "description", "brief", "status",
        "budget_min", "budget_max", 
        "application_deadline", "start_date", "end_date",
        "platforms", "min_followers", "niches", "locations", "deliverables",
        # Original brief fields (though UI might not allow editing, API should handle if sent)
        "company_name", "product_service_name", "campaign_objective", 
        "target_audience", "key_message"
    ]
    
    # AI campaigns have restricted status updates
    allowed_ai_statuses = ['active', 'completed', 'cancelled']

    try:
        # First, fetch the existing campaign to check its creation_method and owner
        # Use the user's JWT for RLS by default by calling auth() on the client
        # Store original headers
        original_postgrest_headers = supabase_client.postgrest.session.headers.copy()
        supabase_client.postgrest.auth(request.raw_jwt)

        existing_campaign_response = supabase_client.table('campaigns')\
            .select('id, user_id, creation_method, status')\
            .eq('id', campaign_id)\
            .maybe_single()\
            .execute()

        # Restore original headers
        supabase_client.postgrest.session.headers = original_postgrest_headers

        if not existing_campaign_response.data:
            return jsonify({"success": False, "error": "Campaign not found."}), 404
        
        existing_campaign = existing_campaign_response.data

        # Authorization Check: Ensure the user owns this campaign
        # This check might be redundant if RLS is fully effective, but good as a safeguard.
        if str(existing_campaign.get('user_id')) != str(current_user_id):
            # If RLS didn't prevent access, this ensures non-owners cannot update.
            # This could happen if RLS is misconfigured or if a service key bypasses user-specific RLS for the select but not for update.
            print(f"⚠️ Authorization mismatch: User {current_user_id} tried to update campaign {campaign_id} owned by {existing_campaign.get('user_id')}.")
            return jsonify({"success": False, "error": "You are not authorized to update this campaign."}), 403

        update_payload = {}
        nested_budget = {}
        nested_timeline = {}
        nested_requirements = {}

        # Handle status update restrictions for AI campaigns
        if existing_campaign.get('creation_method') == 'ai':
            if 'status' in data and data['status'] not in allowed_ai_statuses:
                return jsonify({
                    "success": False, 
                    "error": f"AI-generated campaigns can only have their status set to: {', '.join(allowed_ai_statuses)}."
                }), 400
            # For AI campaigns, only allow 'status' and potentially a few other specific fields if necessary in the future.
            # For now, if it's an AI campaign, we're primarily concerned with status changes (e.g., cancellation).
            # If other fields are sent for an AI campaign, they will be ignored unless explicitly handled here.
            if 'status' in data:
                update_payload['status'] = data['status']
            # Add any other fields AI campaigns are allowed to update here.
            # For now, if only 'status' is in data, other fields won't be processed for AI.

        else: # For 'human' campaigns, process all allowed fields
            for field in allowed_fields:
                if field in data:
                    if field in ["budget_min", "budget_max"]:
                        nested_budget[field.split('_')[1]] = data[field] if data[field] != '' else None
                    elif field in ["application_deadline", "start_date", "end_date"]:
                        # Validate and format date strings if they are not empty
                        validated_date = validate_date_string(data[field]) if data[field] else None
                        nested_timeline[field] = validated_date
                    elif field in ["platforms", "min_followers", "niches", "locations", "deliverables"]:
                        if field == "min_followers":
                            nested_requirements[field] = data[field] if data[field] != '' else None
                        else: # assuming others are arrays or direct values
                            nested_requirements[field] = data[field]
                    else: # Direct top-level fields
                        update_payload[field] = data[field]
        
        # Populate the main payload with nested structures if they have data
        if nested_budget:
            # Ensure existing budget fields are preserved if not all are updated
            # This requires fetching the current budget if only partial update is sent
            current_budget = existing_campaign.get('budget', {}) if isinstance(existing_campaign.get('budget'), dict) else {}
            update_payload['budget'] = {**current_budget, **nested_budget}

        if nested_timeline:
            current_timeline = existing_campaign.get('timeline', {}) if isinstance(existing_campaign.get('timeline'), dict) else {}
            update_payload['timeline'] = {**current_timeline, **nested_timeline}
            
        if nested_requirements:
            current_requirements = existing_campaign.get('requirements', {}) if isinstance(existing_campaign.get('requirements'), dict) else {}
            update_payload['requirements'] = {**current_requirements, **nested_requirements}


        if not update_payload: # If only non-allowed fields were sent for AI, or no valid fields for human
            # For AI campaigns, if only 'status' was sent and it was valid, update_payload would have 'status'.
            # If an AI campaign update request has no 'status' or other AI-allowed fields, this message is appropriate.
            # If a human campaign update request has no recognized fields, this is also appropriate.
            return jsonify({"success": False, "error": "No valid fields provided for update or operation not permitted for AI campaign."}), 400

        update_payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        print(f"💾 Updating campaign ID {campaign_id} for user {current_user_id} with payload: {json.dumps(update_payload, indent=2, default=str)}")

        # Use the user's JWT for RLS on the update operation
        original_postgrest_headers_update = supabase_client.postgrest.session.headers.copy()
        supabase_client.postgrest.auth(request.raw_jwt)

        update_response = supabase_client.table('campaigns')\
            .update(update_payload)\
            .eq('id', campaign_id)\
            .eq('user_id', current_user_id)\
            .execute()

        print(f"💾 Update response: {update_response}")
        
        # Restore original headers for the client
        supabase_client.postgrest.session.headers = original_postgrest_headers_update

        if update_response.data:
            # Fetch the updated campaign to return the full object with all fields
            # Use user's JWT again for this fetch
            original_postgrest_headers_fetch = supabase_client.postgrest.session.headers.copy()
            supabase_client.postgrest.auth(request.raw_jwt)
            
            updated_campaign_response = supabase_client.table('campaigns')\
                .select('*')\
                .eq('id', campaign_id)\
                .single()\
                .execute()
            
            supabase_client.postgrest.session.headers = original_postgrest_headers_fetch

            if updated_campaign_response.data:
                return jsonify({"success": True, "campaign": updated_campaign_response.data, "message": "Campaign updated successfully."})
            else:
                # This case should ideally not happen if update was successful
                print(f"⚠️ Update reported success for campaign {campaign_id}, but failed to re-fetch. Update response: {update_response}")
                return jsonify({"success": True, "campaign": update_payload, "message": "Campaign updated, but full re-fetch failed. Returning partial data."})

        else: # Handle errors from Supabase update
            error_message = "Failed to update campaign."
            if hasattr(update_response, 'error') and update_response.error:
                error_details = getattr(update_response.error, 'message', str(update_response.error))
                error_code = getattr(update_response.error, 'code', 'N/A')
                error_hint = getattr(update_response.error, 'hint', 'N/A')
                error_message += f" Supabase error (Code: {error_code}, Hint: {error_hint}): {error_details}"
            elif hasattr(update_response, 'status_code') and update_response.status_code >= 400:
                error_message += f" HTTP Status: {update_response.status_code}. Response: {getattr(update_response, 'text', str(update_response))[:200]}"
            print(f"❌ Update error for campaign {campaign_id}: {error_message}. Raw response: {update_response}")
            return jsonify({"success": False, "error": error_message}), 500

    except Exception as e:
        error_message = f"An unexpected error occurred: {type(e).__name__} - {str(e)}"
        print(f"❌ Unexpected error in update_campaign_by_id for campaign {campaign_id}: {error_message}")
        import traceback
        traceback.print_exc()
        # Ensure client headers are restored even if an unexpected error occurs
        if 'original_postgrest_headers' in locals() and hasattr(supabase_client, 'postgrest'):
             supabase_client.postgrest.session.headers = original_postgrest_headers
        elif 'original_postgrest_headers_update' in locals() and hasattr(supabase_client, 'postgrest'):
             supabase_client.postgrest.session.headers = original_postgrest_headers_update

        return jsonify({"success": False, "error": error_message}), 500

@app.route('/api/campaigns', methods=['POST'])
@token_required
def create_new_campaign():
    user_id = request.current_user.id
    raw_jwt_token = request.raw_jwt
    data = request.get_json()

    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    db_insert_payload = {
        "user_id": str(user_id),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "creation_method": "human" # Mark as human created
    }

    # Direct mappings from payload
    for key in ['title', 'brand', 'description', 'brief', 'status']:
        if key in data and data[key] is not None:
            db_insert_payload[key] = data[key]
        elif key == 'status' and 'status' not in data : # Default status if not provided at all
             db_insert_payload[key] = 'draft' # Human campaigns can be draft
        # If key is in data but value is None, it will be inserted as NULL if db_insert_payload[key] = None

    # Nested: budget
    budget_data = data.get('budget')
    if budget_data and isinstance(budget_data, dict):
        if 'min' in budget_data and budget_data['min'] is not None:
            db_insert_payload['budget_min'] = budget_data['min']
        if 'max' in budget_data and budget_data['max'] is not None:
            db_insert_payload['budget_max'] = budget_data['max']

    # Nested: timeline
    timeline_data = data.get('timeline')
    if timeline_data and isinstance(timeline_data, dict):
        for key, db_key in [('applicationDeadline', 'application_deadline'),
                             ('startDate', 'start_date'),
                             ('endDate', 'end_date')]:
            if key in timeline_data and timeline_data[key]:
                # validate_date_string should return None if invalid, which is fine for DB
                db_insert_payload[db_key] = validate_date_string(timeline_data[key])

    # Nested: requirements
    requirements_data = data.get('requirements')
    if requirements_data and isinstance(requirements_data, dict):
        for key, db_key in [('platforms', 'platforms'),
                             ('minFollowers', 'min_followers'),
                             ('niches', 'niches'),
                             ('locations', 'locations'),
                             ('deliverables', 'deliverables')]:
            if key in requirements_data and requirements_data[key] is not None:
                 db_insert_payload[db_key] = requirements_data[key]
    
    # Optional fields from AI generation (company_name, etc.) are not expected from this form
    # They will be NULL if not in db_insert_payload and columns are nullable.

    if not supabase_client or not hasattr(supabase_client, 'postgrest'):
        return jsonify({"success": False, "error": "Supabase client not configured"}), 500

    original_postgrest_headers = supabase_client.postgrest.session.headers.copy()
    try:
        if raw_jwt_token:
            supabase_client.postgrest.auth(raw_jwt_token)
        
        insert_response = supabase_client.table('campaigns').insert(db_insert_payload).execute()

        if hasattr(insert_response, 'data') and insert_response.data:
            created_campaign_raw = insert_response.data[0]
            
            # Simple transform for the response, similar to list_campaigns
            transformed_campaign = {
                "id": created_campaign_raw.get("id"),
                "title": created_campaign_raw.get("title"),
                "brand": created_campaign_raw.get("brand"),
                "description": created_campaign_raw.get("description"),
                "brief": created_campaign_raw.get("brief"),
                "status": created_campaign_raw.get("status"),
                "creation_method": created_campaign_raw.get("creation_method"), # Include creation_method
                "budget": {
                    "min": created_campaign_raw.get("budget_min"),
                    "max": created_campaign_raw.get("budget_max")
                },
                "timeline": {
                    "applicationDeadline": created_campaign_raw.get("application_deadline"),
                    "startDate": created_campaign_raw.get("start_date"),
                    "endDate": created_campaign_raw.get("end_date")
                },
                "requirements": {
                    "platforms": created_campaign_raw.get("platforms"),
                    "minFollowers": created_campaign_raw.get("min_followers"),
                    "niches": created_campaign_raw.get("niches"),
                    "locations": created_campaign_raw.get("locations"),
                    "deliverables": created_campaign_raw.get("deliverables")
                },
                "aiInsights": created_campaign_raw.get("ai_insights"),
                "userId": created_campaign_raw.get("user_id"),
                "createdAt": created_campaign_raw.get("created_at"),
                "updatedAt": created_campaign_raw.get("updated_at")
                # company_name etc. will be included if they are in created_campaign_raw and columns exist
            }
            # Add any other top-level fields from the raw campaign if they exist (like company_name, etc.)
            for key in ['company_name', 'product_service_name', 'campaign_objective', 'target_audience', 'key_message']:
                if created_campaign_raw.get(key) is not None:
                    transformed_campaign[key] = created_campaign_raw.get(key)

            return jsonify({"success": True, "campaign": transformed_campaign}), 201
        else:
            error_msg = "Failed to create campaign in database."
            if hasattr(insert_response, 'error') and insert_response.error:
                 error_details = getattr(insert_response.error, 'message', str(insert_response.error))
                 error_msg += f" Details: {error_details}"
            elif hasattr(insert_response, 'status_code'): # Check for other HTTP errors from Supabase
                error_msg += f" Status: {insert_response.status_code}. Response: {str(insert_response)[:200]}"

            print(f"❌ Supabase insert error: {error_msg}. Raw Response: {insert_response}")
            return jsonify({"success": False, "error": error_msg}), 500
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"An unexpected error occurred: {str(e)}"}), 500
    finally:
        if supabase_client and hasattr(supabase_client, 'postgrest'):
             supabase_client.postgrest.session.headers = original_postgrest_headers

def transform_campaign_for_frontend(campaign_data):
    """Transforms a single campaign record from Supabase to a frontend-friendly format."""
    if not campaign_data:
        return None

    # Ensure dates are strings or None
    application_deadline = campaign_data.get('application_deadline')
    start_date = campaign_data.get('start_date')
    end_date = campaign_data.get('end_date')
    created_at = campaign_data.get('created_at')
    updated_at = campaign_data.get('updated_at') # Assuming this field might exist

    return {
        "id": campaign_data.get('id'),
        "title": campaign_data.get('title'),
        "brand": campaign_data.get('brand'),
        "status": campaign_data.get('status'),
        "description": campaign_data.get('description'),
        "brief": campaign_data.get('brief'), # Added brief
        "creation_method": campaign_data.get('creation_method'), # Added creation_method
        "budget": {
            "min": campaign_data.get('budget_min'),
            "max": campaign_data.get('budget_max')
        },
        "timeline": {
            "applicationDeadline": application_deadline if application_deadline else None,
            "startDate": start_date if start_date else None,
            "endDate": end_date if end_date else None
        },
        "requirements": { # Assuming these map directly for now
            "platforms": campaign_data.get('platforms', []), # Default to empty list if None
            "minFollowers": campaign_data.get('min_followers'),
            "niches": campaign_data.get('niches', []), # Default to empty list if None
            "locations": campaign_data.get('locations', []), # Default to empty list if None
            "deliverables": campaign_data.get('deliverables', []) # Default to empty list if None
        },
        # Include original brief fields from the database if they exist
        "company_name": campaign_data.get('company_name'),
        "product_service_name": campaign_data.get('product_service_name'),
        "campaign_objective": campaign_data.get('campaign_objective'),
        "target_audience": campaign_data.get('target_audience'),
        "key_message": campaign_data.get('key_message'),
        
        "ai_insights": campaign_data.get('ai_insights'), # Make sure this is included
        "user_id": campaign_data.get('user_id'), # Include user_id
        "created_at": created_at if created_at else None, # Include created_at
        "updated_at": updated_at if updated_at else None, # Include updated_at
        "applicants": campaign_data.get('applicants', 0), # Placeholder, assuming you might add this
        "selected": campaign_data.get('selected', 0)     # Placeholder
    }

if __name__ == '__main__':
    app.run(debug=True, port=int(os.getenv('PORT', 5001))) # Use PORT from env if available