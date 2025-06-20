from flask import Flask, jsonify, request, send_from_directory, g, has_request_context, redirect, url_for, session as flask_session, make_response # Added redirect, url_for, session as flask_session
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
from postgrest.exceptions import APIError # IMPORTED APIError
from email.mime.text import MIMEText # Added for Gmail sending
import base64 # Added for Gmail sending
import secrets # Added for secrets
import sys # <--- ADD THIS IMPORT
from werkzeug.middleware.proxy_fix import ProxyFix # <--- ADD THIS IMPORT

# Google OAuth specific imports
from google_auth_oauthlib.flow import Flow as GoogleFlow
from google.oauth2.credentials import Credentials as GoogleCredentials
from googleapiclient.discovery import build as build_google_api_service
import google.auth.exceptions
import google.auth.transport.requests # Added for token refresh
from googleapiclient.errors import HttpError # Ensure this import is present

# Import Twilio and ElevenLabs
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Say, Play, Record, Gather, Stream, Connect
from elevenlabs.client import ElevenLabs # type: ignore # Use this for the main client
import shutil # For saving audio file temporarily
import uuid   # For generating unique filenames
import urllib.request # For downloading the recording
import time # Added import for time.sleep()
from urllib.parse import urlparse # Add this import

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# 1. Set SECRET_KEY immediately and log it
retrieved_secret_key = os.getenv("FLASK_APP_SECRET_KEY", "fallback-dev-secret-key-please-change")
app.config['SECRET_KEY'] = retrieved_secret_key
# Use app.logger.error for high visibility in logs for this critical check
app.logger.error(f"--- INIT CHECKPOINT 1 --- Flask app.config['SECRET_KEY'] set to: '{app.config.get('SECRET_KEY')}' ---")

# 2. Apply ProxyFix after SECRET_KEY is set
# This helps Flask understand it's behind a proxy and handle SSL/TLS termination correctly for session cookies.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=0, x_prefix=1)
app.logger.info("--- INIT CHECKPOINT 2 --- ProxyFix applied (x_host=0)---")


# 3. Configure other session cookie parameters
app.config.update(
    SESSION_COOKIE_SAMESITE='None',
    SESSION_COOKIE_SECURE=True
)
app.logger.info(f"--- INIT CHECKPOINT 3 --- SESSION_COOKIE_SAMESITE set to: {app.config.get('SESSION_COOKIE_SAMESITE')}, SECURE set to: {app.config.get('SESSION_COOKIE_SECURE')} ---")

# Remove the old app.secret_key assignment as it's now handled by app.config['SECRET_KEY']
# app.secret_key = os.getenv("FLASK_APP_SECRET_KEY", "fallback-dev-secret-key-please-change")


# 4. Set SERVER_NAME from FLASK_APP_BASE_URL for better cookie domain handling
FLASK_APP_BASE_URL_FOR_SERVER_NAME = os.getenv("FLASK_APP_BASE_URL")
if FLASK_APP_BASE_URL_FOR_SERVER_NAME:
    parsed_url = urlparse(FLASK_APP_BASE_URL_FOR_SERVER_NAME)
    server_name_hostname = parsed_url.hostname 
    if server_name_hostname:
        app.config['SERVER_NAME'] = server_name_hostname
        # EXPLICITLY SET SESSION_COOKIE_DOMAIN
        app.config['SESSION_COOKIE_DOMAIN'] = server_name_hostname
        app.logger.info(f"✅ Flask app.config['SERVER_NAME'] set to: {server_name_hostname}")
    else:
        app.logger.warning(f"⚠️ Could not parse hostname from FLASK_APP_BASE_URL: {FLASK_APP_BASE_URL_FOR_SERVER_NAME}")
else:
    app.logger.warning("⚠️ FLASK_APP_BASE_URL not set, cannot configure app.config['SERVER_NAME'] optimally.")

# MODIFIED @after_request hook to log Set-Cookie headers for multiple paths
@app.after_request
def log_set_cookie_info(response): # Renamed function
    # Add any other paths here if you need to debug their Set-Cookie headers
    paths_to_log_cookies_for = ['/api/auth/google/login', '/api/test-session'] # Added /api/test-session
    if request.path in paths_to_log_cookies_for:
        try:
            set_cookie_headers = response.headers.getlist('Set-Cookie')
            if set_cookie_headers:
                app.logger.error(f"--- @after_request for {request.path}: Set-Cookie headers being sent: {set_cookie_headers} ---")
            else:
                app.logger.error(f"--- @after_request for {request.path}: No Set-Cookie headers found in response. ---")
        except Exception as e:
            app.logger.error(f"--- @after_request for {request.path}: Error logging Set-Cookie headers: {e} ---")
    return response

# NEW DETAILED LOGGING FOR SECRET KEY
if not app.secret_key:
    app.logger.error("🔴 CRITICAL: Flask app.secret_key is NOT SET (None or empty after os.getenv). Session management will FAIL.")
elif app.secret_key == "fallback-dev-secret-key-please-change":
    app.logger.warning("⚠️ WARNING: FLASK_APP_SECRET_KEY is using the default fallback. Session management will work, but PLEASE set a strong secret key in backend/.env for production.")
else:
    app.logger.info(f"✅ Flask app.secret_key is SET. Length: {len(app.secret_key)}. Session management should be operational.")

# Configure CORS
# For development, allow your frontend's localhost. 
# For production, add your specific Vercel frontend URL(s).
CORS(app, resources={r"/api/*": {"origins": [
    "http://localhost:5173", # For local frontend development
    os.getenv("VITE_FRONTEND_URL", "https://influencerflowai.vercel.app") # Use an env var for Vercel URL, updated to actual Vercel URL
    # You can add more specific preview URLs if needed, e.g., "https://*.vercel.app"
]}})

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
# Ensure FLASK_APP_BASE_URL is in your .env, e.g., FLASK_APP_BASE_URL=http://localhost:5001
FLASK_APP_BASE_URL = os.getenv("FLASK_APP_BASE_URL") 
GOOGLE_OAUTH_REDIRECT_URI = f"{FLASK_APP_BASE_URL}/api/oauth2callback/google"

# This is the scope required to send emails on behalf of the user.
# It does not grant permission to read or delete emails.
# Added openid, email, profile to match scopes often returned by Google by default
# and to prevent "Scope has changed" errors during token fetch.
GOOGLE_OAUTH_SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
]

if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
    app.logger.warning("Google OAuth Client ID or Secret not configured in backend/.env. Gmail integration will fail.")
if not FLASK_APP_BASE_URL:
    app.logger.warning("FLASK_APP_BASE_URL not configured in backend/.env. Google OAuth redirect URI may be incorrect.")

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
# call_artifacts_store = {} # REMOVE THIS LINE

# Define the Niche Map at the module level (outside any function)
NICHE_MAP = {
    "ai in finance": ["finance", "technology", "fintech"],
    "big data analytics": ["technology", "data science", "analytics"],
    "cloud solutions": ["technology", "saas", "it infrastructure"],
    "cloud solutions for enterprises": ["technology", "saas", "enterprise software", "b2b"],
    "tech and automotive": ["technology", "automotive"],
    "lifestyle and travel": ["lifestyle", "travel"],
    "ai and big data": ["technology", "ai", "big data"],
    # Add common niches from your mock data as keys if they might be specific inputs
    "fitness": ["fitness", "health", "wellness"],
    "health": ["health", "wellness", "medical"],
    "lifestyle": ["lifestyle"],
    "technology": ["technology", "tech"],
    "gaming": ["gaming", "esports"],
    "fashion": ["fashion", "style", "apparel"],
    "food": ["food", "cooking", "culinary"],
    "travel": ["travel", "tourism"],
    "beauty": ["beauty", "skincare", "cosmetics"],
    "education": ["education", "learning"],
    "finance": ["finance", "fintech", "investing"],
    "wellness": ["wellness", "health", "mindfulness"],
    "yoga": ["yoga", "wellness", "fitness", "mindfulness"],
    # ... add more mappings as needed based on typical AI campaign niche outputs
    # and the niches present in your creator data.
}

# --- Google OAuth Helper Functions --- START ---
def get_google_user_credentials(user_id: str) -> GoogleCredentials | None:
    # WORKAROUND: Using supabase_admin_client for reading due to RLS issues with regular client.
    if not supabase_admin_client:
        print(f"User {user_id}: Supabase ADMIN client not initialized. Cannot perform diagnostic read.", flush=True)
        return None

    required_scopes_list = GOOGLE_OAUTH_SCOPES
    if isinstance(GOOGLE_OAUTH_SCOPES, str):
        required_scopes_list = [s.strip() for s in GOOGLE_OAUTH_SCOPES.split(',')]

    print(f"User {user_id}: Attempting to fetch Google OAuth tokens from Supabase USING ADMIN CLIENT (RLS WORKAROUND).", flush=True)
    
    try:
        # Fetch all rows using supabase_admin_client
        token_response = (supabase_admin_client.table('user_google_oauth_tokens')
            .select('user_id, access_token, refresh_token, token_uri, client_id, client_secret, scopes, expiry_timestamp_utc')
            .execute())

        # print(f"User {user_id}: (ADMIN READ) Raw token_response.data: {token_response.data}", flush=True) # Verbose
        
        user_token_data = None
        if token_response.data:
            # print(f"User {user_id}: (ADMIN READ) Successfully fetched {len(token_response.data)} record(s). Searching for user {user_id}.", flush=True) # Verbose
            for record in token_response.data:
                if str(record.get('user_id')) == str(user_id):
                    user_token_data = record
                    # print(f"User {user_id}: (ADMIN READ) Found matching record for user_id {user_id}.", flush=True) # Verbose
                    break
            
            if not user_token_data:
                print(f"User {user_id}: (ADMIN READ) No token data found for the *current* user_id ('{user_id}') after checking all fetched records.", flush=True)
                return None
        else:
            print(f"User {user_id}: (ADMIN READ) No data returned from user_google_oauth_tokens by ADMIN client.", flush=True)
            return None
        
        access_token = user_token_data.get('access_token')
        refresh_token = user_token_data.get('refresh_token')
        
        token_uri_from_db = user_token_data.get('token_uri', 'https://oauth2.googleapis.com/token')
        client_id_from_db = user_token_data.get('client_id', GOOGLE_CLIENT_ID)
        client_secret_from_db = user_token_data.get('client_secret', GOOGLE_CLIENT_SECRET)

        if not access_token:
            print(f"User {user_id}: (ADMIN READ) Access token missing in the identified user_token_data.", flush=True)
            return None

        expiry_datetime_utc = None
        raw_expiry_timestamp = user_token_data.get('expiry_timestamp_utc')
        if raw_expiry_timestamp:
            try:
                expiry_str = str(raw_expiry_timestamp)
                if expiry_str.endswith('Z'):
                    aware_expiry_dt = datetime.fromisoformat(expiry_str[:-1] + '+00:00')
                else:
                    aware_expiry_dt = datetime.fromisoformat(expiry_str)
                expiry_datetime_utc = aware_expiry_dt.astimezone(timezone.utc).replace(tzinfo=None)
            except Exception as e_parse:
                print(f"User {user_id}: (ADMIN READ) ERROR parsing expiry_timestamp_utc '{raw_expiry_timestamp}': {type(e_parse).__name__} - {e_parse}", flush=True)
                expiry_datetime_utc = None

        stored_scopes_raw = user_token_data.get('scopes')
        parsed_scopes_for_creds = [] 
        if isinstance(stored_scopes_raw, list):
            parsed_scopes_for_creds = stored_scopes_raw
        elif isinstance(stored_scopes_raw, str):
            try:
                parsed_scopes_for_creds = json.loads(stored_scopes_raw)
                if not isinstance(parsed_scopes_for_creds, list): 
                    parsed_scopes_for_creds = []
            except json.JSONDecodeError:
                parsed_scopes_for_creds = [s.strip() for s in stored_scopes_raw.split(',') if s.strip()]
        
        credentials = GoogleCredentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri=token_uri_from_db,
            client_id=client_id_from_db,
            client_secret=client_secret_from_db,
            scopes=parsed_scopes_for_creds, 
            expiry=expiry_datetime_utc 
        )
        
        # print(f"User {user_id}: (ADMIN READ) Constructed GoogleCredentials object. Valid: {credentials.valid}, Expired: {credentials.expired}", flush=True) # Verbose
        return credentials

    except APIError as e_api: 
        print(f"User {user_id}: (ADMIN READ) Supabase APIError: {e_api}", flush=True)
        print(f"User {user_id}: (ADMIN READ) APIError details: code={getattr(e_api, 'code', 'N/A')}, message={getattr(e_api, 'message', 'N/A')}", flush=True)
        return None
    except Exception as e:
        print(f"User {user_id}: (ADMIN READ) General Exception: {type(e).__name__} - {e}", flush=True)
        import traceback
        print(traceback.format_exc(), flush=True)
        return None

# --- Google OAuth Helper Functions --- END ---

# --- JWT Authentication Decorator ---
def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        print(f"🕵️ ENTERING @token_required for endpoint: {request.endpoint}, method: {request.method}") # DEBUG
        if request.method == 'OPTIONS':
            print("🕵️ @token_required: OPTIONS request, passing through.") # DEBUG
            # Allow OPTIONS requests to pass through. Flask-CORS will handle them.
            return f(*args, **kwargs)

        token = None
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            print(f"🕵️ @token_required: Authorization header found: {auth_header[:30]}...") # DEBUG
            try:
                token = auth_header.split(" ")[1] # Bearer <token>
            except IndexError:
                print("🕵️ @token_required: Malformed Authorization header.") # DEBUG
                return jsonify({"success": False, "error": "Malformed Authorization header"}), 401
        else:
            print("🕵️ @token_required: Authorization header MISSING.") # DEBUG


        if not token:
            print("🕵️ @token_required: Token is missing after checks.") # DEBUG
            return jsonify({"success": False, "error": "Authorization token is missing"}), 401

        if not supabase_client:
            print("🕵️ @token_required: Supabase client not initialized.") # DEBUG
            return jsonify({"success": False, "error": "Supabase client not initialized on backend for token validation."}), 500

        print(f"🕵️ @token_required: Attempting to validate token: {token[:20]}...") # DEBUG
        try:
            user_response = supabase_client.auth.get_user(token)
            # Ensure user_response and user_response.user are not None before accessing properties
            user_id_for_log = 'Unknown'
            if user_response and hasattr(user_response, 'user') and user_response.user and hasattr(user_response.user, 'id'):
                user_id_for_log = user_response.user.id
            
            print(f"🔑 @token_required: Token validated for user: {user_id_for_log}") # DEBUG
            request.current_user = user_response.user if user_response else None # Ensure request.current_user can be None
            g.current_user = user_response.user if user_response else None # ADDED: Set on g as well for compatibility
            request.raw_jwt = token # Store raw token on request
        except Exception as e:
            print(f"❌ @token_required: Token validation error: {type(e).__name__} - {str(e)}") # DEBUG
            import traceback
            traceback.print_exc() # Print full traceback for this error
            return jsonify({"success": False, "error": f"Invalid or expired token: {str(e)}"}), 401
        
        print(f"🕵️ @token_required: Proceeding to execute wrapped function: {f.__name__}") # DEBUG
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
        "industry": "string (e.g., 'Technology', 'Fashion') or null", # Added for campaign's primary industry
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

    prompt = f"""You are an expert campaign analyst. Your task is to meticulously read the following text extracted from a campaign brief document and identify key campaign requirements.
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
def build_live_voice_negotiation_prompt(call_session_data): # MODIFIED: Parameter changed from call_sid to call_session_data
    if not call_session_data:
        print(f"❌ build_live_voice_negotiation_prompt: call_session_data is None or empty.")
        return None

    call_sid = call_session_data.get('call_sid', 'unknown_sid') # Get call_sid for logging if needed
    print(f"🔨 Building prompt for SID {call_sid} using call_session_data: {call_session_data}")

    # Extract necessary details from call_session_data (the Supabase record)
    # These fields might be in the 'metadata' JSONB field or top-level, adjust as per your DB structure.
    # Assuming for now they might be in a 'metadata' field or you might fetch related outreach/campaign details.
    # For this example, let's assume some defaults if not found, or ideally, these would be populated from related tables.
    
    outreach_id = call_session_data.get('outreach_id')
    # Potentially fetch outreach/campaign details using outreach_id if needed for brand_name, campaign_objective etc.
    # For simplicity, we'll use placeholders or directly access from metadata if available.
    # This part might require more sophisticated data fetching in a real scenario.

    # Attempt to get creator_name, brand_name, campaign_objective from metadata or fallback to defaults.
    # In a more robust system, you'd fetch the outreach record using outreach_id, then the campaign record, etc.
    # For now, let's assume they might be in `call_session_data.metadata` or use placeholders.
    metadata = call_session_data.get('metadata', {})
    creator_name = metadata.get('creator_name', 'the creator') # Example: You might store this in metadata
    brand_name = metadata.get('brand_name', 'our company')       # Example
    campaign_objective = metadata.get('campaign_objective', 'discuss a potential collaboration') # Example
    email_summary = metadata.get('email_conversation_summary', "No prior email conversation summary available.") # Example

    live_call_history_list = call_session_data.get('conversation_history', [])
    if not isinstance(live_call_history_list, list):
        print(f"⚠️ Conversation history for SID {call_sid} is not a list in call_session_data. Resetting.")
        live_call_history_list = []

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
# ... (after your /api/hello route) ...

# SIMPLE SESSION TEST ROUTE
@app.route('/api/test-session', methods=['GET'])
def test_session():
    app.logger.error("--- /api/test-session: ENTERING ---")
    
    # Create response object early to pass to save_session
    resp = make_response(jsonify({
        "message": "Test session initiated. Check logs for Set-Cookie header.",
        "session_content_at_test_route": "will_be_updated_if_session_not_None", 
        "manual_cookie_should_be_set": True
    }))

    try:
        # Attempt to set a simple value in the session
        flask_session['test_data'] = 'Hello, Session!'
        flask_session.modified = True
        app.logger.error(f"--- /api/test-session: Set 'test_data'. Session content: {dict(flask_session)} ---")
        
        # Update response payload with actual session content
        current_session_content_for_json = "Session is None"
        if flask_session is not None:
            # Ensure flask_session is serializable for jsonify, dict() usually works for simple sessions
            try:
                current_session_content_for_json = dict(flask_session)
            except Exception as e_dict:
                app.logger.error(f"  Error converting flask_session to dict: {e_dict}")
                current_session_content_for_json = "Error converting session to dict"
        
        # Safely update resp.json; make_response might have already serialized it if jsonify was used.
        # A more robust way is to rebuild the JSON data.
        json_data = {
            "message": "Test session initiated. Check logs for Set-Cookie header.",
            "session_content_at_test_route": current_session_content_for_json,
            "manual_cookie_should_be_set": True
        }
        resp.set_data(json.dumps(json_data)) # type: ignore
        resp.mimetype = 'application/json'


        # Log security and host details for diagnostic comparison
        app.logger.error(f"--- /api/test-session: Security check: request.is_secure={request.is_secure}, request.scheme={request.scheme}, request.host={request.host}, SERVER_NAME={app.config.get('SERVER_NAME')}, SESSION_COOKIE_DOMAIN={app.config.get('SESSION_COOKIE_DOMAIN')} ---")

        # Detailed Session and Interface Inspection (as before)
        app.logger.error("--- /api/test-session: Detailed Session and Interface Inspection ---")
        app.logger.error(f"  flask_session.permanent: {getattr(flask_session, 'permanent', 'N/A')}")
        app.logger.error(f"  flask_session.modified: {getattr(flask_session, 'modified', 'N/A')}")
        app.logger.error(f"  flask_session.new: {getattr(flask_session, 'new', 'N/A')}")
        
        si = app.session_interface
        app.logger.error(f"  Session Interface Type: {type(si).__name__}")
        app.logger.error(f"  si.get_cookie_name(app): {si.get_cookie_name(app)}")
        app.logger.error(f"  si.get_cookie_domain(app): {si.get_cookie_domain(app)}")
        app.logger.error(f"  si.get_cookie_path(app): {si.get_cookie_path(app)}")
        app.logger.error(f"  si.get_cookie_httponly(app): {si.get_cookie_httponly(app)}")
        app.logger.error(f"  si.get_cookie_secure(app): {si.get_cookie_secure(app)}")
        app.logger.error(f"  si.get_cookie_samesite(app): {si.get_cookie_samesite(app)}")
        
        expiration_time = "N/A"
        if flask_session is not None: # get_expiration_time expects a session object
            try:
                expiration_time = si.get_expiration_time(app, flask_session)
            except Exception as e_exp:
                app.logger.error(f"  Error getting expiration time: {e_exp}")
        app.logger.error(f"  si.get_expiration_time(app, flask_session): {expiration_time}")
        
        should_set_cookie_val = False
        if flask_session is not None: # should_set_cookie expects a session object
            try:
                should_set_cookie_val = si.should_set_cookie(app, flask_session)
            except Exception as e_ssc:
                 app.logger.error(f"  Error calling should_set_cookie: {e_ssc}")
        else:
            app.logger.error("  flask_session is None, so should_set_cookie would be False.")
        app.logger.error(f"  CRUCIAL: si.should_set_cookie(app, flask_session): {should_set_cookie_val}")

        # <<< MANUALLY CALLING save_session START >>>
        app.logger.error("--- /api/test-session: Attempting to MANUALLY call app.session_interface.save_session() ---")
        try:
            if flask_session is None:
                app.logger.error("  WARNING: flask_session is None before manual call to save_session! This is unexpected if data was just set.")
            
            # We proceed to call save_session regardless of should_set_cookie for this direct test,
            # but log its value. Flask internally would check should_set_cookie.
            # The important part is to see if save_session *can* add a cookie to resp.
            app.logger.error(f"  Value of should_set_cookie before manual call: {should_set_cookie_val}")
            
            if flask_session is not None: # save_session requires a session object
                 app.logger.error(f"  Calling si.save_session(app, flask_session_object_id={id(flask_session)}, resp_object_id={id(resp)})")
                 si.save_session(app, flask_session, resp) # Pass our response object
                 app.logger.error("  MANUAL save_session call completed.")
            else:
                app.logger.error("  SKIPPING manual save_session call because flask_session is None.")

        except Exception as e_save:
            app.logger.error(f"  EXCEPTION during manual app.session_interface.save_session(): {e_save}", exc_info=True)
        
        # Log headers on *our* resp object immediately after manual save_session attempt
        manual_save_cookies = resp.headers.getlist('Set-Cookie')
        if manual_save_cookies:
            app.logger.error(f"  Cookies on OUR RESPONSE object (id={id(resp)}) after manual save_session attempt: {manual_save_cookies}")
        else:
            app.logger.error(f"  NO cookies on OUR RESPONSE object (id={id(resp)}) after manual save_session attempt.")
        # <<< MANUALLY CALLING save_session END >>>

        # Attempt to set an arbitrary cookie manually - we know this part works
        manual_cookie_domain = app.config.get('SESSION_COOKIE_DOMAIN') or app.config.get('SERVER_NAME')
        if manual_cookie_domain: # Ensure domain is not None
            app.logger.error(f"--- /api/test-session: Attempting to set manual_test_cookie (on resp id={id(resp)}) with domain: {manual_cookie_domain} ---")
            resp.set_cookie(
                'manual_test_cookie', 
                'hello_from_manual_cookie', 
                domain=manual_cookie_domain, 
                secure=app.config.get('SESSION_COOKIE_SECURE', True), 
                httponly=True, 
                samesite=app.config.get('SESSION_COOKIE_SAMESITE', 'None'),
                path='/'
            )
            app.logger.error(f"--- /api/test-session: 'manual_test_cookie' should have been added to response headers by resp.set_cookie(). Check final @after_request log. ---")
        else:
            app.logger.error(f"--- /api/test-session: NOT setting manual_test_cookie due to missing domain (SESSION_COOKIE_DOMAIN or SERVER_NAME). ---")

        return resp, 200

    except Exception as e:
        app.logger.error(f"--- /api/test-session: Error during test_session execution: {e} ---", exc_info=True)
        # If we had an error before creating resp, we need a fallback.
        if 'resp' not in locals() or not isinstance(resp, app.response_class): # type: ignore
            return jsonify({"error": "Critical error in test_session before response creation or resp is invalid, check logs"}), 500
        # If resp was created but error happened after, it might not be fully formed.
        # Best to return a generic error if something went very wrong with session logic.
        current_error_json = {"error": f"Error in test_session: {str(e)}"}
        resp.set_data(json.dumps(current_error_json)) # type: ignore
        resp.mimetype = 'application/json'
        resp.status_code = 500
        return resp

# --- Google OAuth Helper Functions --- START ---
# ... (rest of your file) ...

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
    company_name = requirements_data.get('companyName', 'the client')
    industry_list = requirements_data.get('industry', [])
    # For the prompt context, using the first industry from the list if available.
    # The LLM will be asked to determine the primary campaign industry for the JSON output.
    primary_industry_for_context = industry_list[0] if industry_list else '[General Industry]'
    product_service = requirements_data.get('productService', '[Product/Service]')
    business_goals_list = requirements_data.get('businessGoals', [])
    business_goals_str = ", ".join(business_goals_list) if business_goals_list else '[Business Goals]'
    
    # Updated to use campaignAudienceDescription for the viewers
    campaign_audience_desc = requirements_data.get('campaignAudienceDescription', '[Campaign Target Audience - Viewers]')
    
    # Added to get targetInfluencerDescription for the creators
    target_influencer_desc = requirements_data.get('targetInfluencerDescription', '[Target Influencer Profile - Creators]')
    
    demographics = requirements_data.get('demographics', '[Demographics]') # Assuming this key might exist
    
    # Handle campaignObjective, ensuring it's a string for the prompt
    campaign_objectives_input = requirements_data.get('campaignObjective', ['Not specified']) # Default to list with 'Not specified'
    if isinstance(campaign_objectives_input, list):
        campaign_objective_str_for_prompt = ", ".join(campaign_objectives_input) if campaign_objectives_input else 'Not specified'
    elif isinstance(campaign_objectives_input, str):
        campaign_objective_str_for_prompt = campaign_objectives_input if campaign_objectives_input else 'Not specified'
    else:
        campaign_objective_str_for_prompt = 'Not specified' # Fallback for unexpected types

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

    # Original prompt structure with modifications for new audience fields:
    prompt = f"""You are an expert campaign strategist. Based on the following business requirements, generate a comprehensive and creative influencer marketing campaign plan.

Business Requirements:
Company Name: {company_name}
Primary Industry Context: {primary_industry_for_context} # This is context from requirements
Product/Service: {product_service}
Campaign Objective: {campaign_objective_str_for_prompt}
Campaign's Target Audience (Viewers): {campaign_audience_desc} # MODIFIED: New field and label
Target Influencer Profile (Creators): {target_influencer_desc} # MODIFIED: New field and label
Key Message: {key_message}
Budget Range: {budget_min_req} - {budget_max_req} # MODIFIED: Use budget_min_req, budget_max_req
Timeline: {timeline}
Content Requirements/Deliverables: {content_types} # MODIFIED: Use content_types
Preferred Platforms: {preferred_platforms} # MODIFIED: Use preferred_platforms
Geographic Focus: {requirements_data.get('locations', ['Not specified'])}
Tone/Voice: {requirements_data.get('toneOfVoice', 'Professional and engaging')}
Existing Brand Guidelines: {requirements_data.get('brandGuidelines', 'None specified')}
KPIs for Success: {requirements_data.get('kpis', ['Not specified'])}

CAMPAIGN GENERATION REQUIREMENTS:
Your response MUST be a single, valid JSON object and NOTHING ELSE.
NO INTRODUCTORY TEXT. NO EXPLANATIONS. NO MARKDOWN CODE FENCES (```json or ```).
ADHERE STRICTLY TO THE JSON FORMAT AND ALL SYNTAX RULES.

JSON Structure and Rules:
1.  **`title` (String)**: Catchy and descriptive. Must be a single string in double quotes (e.g., "My Awesome Campaign").
2.  **`brand` (String)**: Brand name for the campaign (use "{company_name}"). Must be a single string in double quotes.
3.  **`industry` (String or Null)**: The primary industry for THIS SPECIFIC CAMPAIGN (e.g., "Technology", "Fashion", "Gaming"). This might be derived from the business requirements but should be a single descriptor for the campaign. If not clearly identifiable or applicable, use null.
4.  **`description` (String)**: Short, compelling overview (2-3 sentences). Must be a single string in double quotes.
5.  **`brief` (String)**: Detailed brief (3-5 sentences) expanding on the objective and target audience. Must be a single string in double quotes. Do NOT use arrays or lists for this field.
6.  **`platforms` (Array of Strings)**: Recommended platforms. Must be a JSON array of strings (e.g., ["Instagram", "YouTube", "TikTok"]). Each string in the array must be in double quotes.
7.  **`minFollowers` (Integer)**: Suggested minimum follower count for influencers (e.g., 5000).
8.  **`niches` (Array of Strings)**: Target influencer niches. Must be a JSON array of strings (e.g., ["Technology", "Finance", "AI"]).
9.  **`locations` (Array of Strings)**: Target geographic locations for influencers. Must be a JSON array of strings (e.g., ["USA", "Global"]).
10. **`deliverables` (Array of Strings)**: Specific content deliverables. Must be a JSON array of strings (e.g., ["1 Instagram Post", "2 Stories"]).
11. **`budgetMin` (Integer)**: Estimated minimum budget for the campaign (USD) (e.g., 5000).
12. **`budgetMax` (Integer)**: Estimated maximum budget for the campaign (USD) (e.g., 15000).
13. **`startDate` (String)**: "YYYY-MM-DD" format (e.g., "2024-08-01"). Must be a single string in double quotes.
14. **`endDate` (String)**: "YYYY-MM-DD" format (e.g., "2024-09-30"). Must be a single string in double quotes.
15. **`applicationDeadline` (String)**: "YYYY-MM-DD" format (e.g., "2024-07-15"). Must be a single string in double quotes.
16. **`aiInsights` (Object)**: Detailed AI-driven analysis. This MUST be a JSON object containing the following keys:
    *   `strategy` (String): Overall strategic approach. Must be a single string in double quotes.
    *   `reasoning` (String): Justification for choices. Must be a single string in double quotes.
    *   `successFactors` (Array of Strings): Key elements for success. Must be a JSON array of strings.
    *   `potentialChallenges` (Array of Strings): Foreseeable obstacles. Must be a JSON array of strings.
    *   `optimizationSuggestions` (Array of Strings): Tips for improvement. Must be a JSON array of strings.
17. **`confidence` (Float)**: Your confidence in this campaign plan (0.0 to 1.0, e.g., 0.9).

CRITICAL JSON SYNTAX REMINDERS:
- Every key MUST be in double quotes (e.g., "title").
- Every string value MUST be in double quotes (e.g., "My Campaign"). This includes all items within arrays of strings.
- Key-value pairs are separated by a colon (`:`). (e.g., "title": "My Campaign").
- Pairs are separated by commas (`,`). THE LAST PAIR IN AN OBJECT OR THE LAST ITEM IN AN ARRAY SHOULD NOT HAVE A TRAILING COMMA.
- JSON objects are enclosed in curly braces (`{{` and `}}`).
- JSON arrays are enclosed in square brackets (`[` and `]`).

Example of the REQUIRED JSON output format:
```json
{{
  "title": "Example Campaign: AI for Small Business Growth",
  "brand": "{company_name}",
  "description": "A dynamic campaign to promote AI solutions for SMBs, driving adoption and engagement.",
  "brief": "This campaign targets small to medium-sized business owners and decision-makers, educating them on the benefits of AI tools for marketing, operations, and customer service. The goal is to generate leads and establish the brand as a leader in AI for SMBs.",
  "platforms": ["LinkedIn", "YouTube"],
  "minFollowers": 5000,
  "niches": ["Small Business", "Entrepreneurship", "Marketing Technology", "AI"],
  "locations": ["USA", "Canada"],
  "deliverables": ["2 LinkedIn Articles", "1 Explainer Video on YouTube", "3 Short LinkedIn Posts"],
  "budgetMin": 5000,
  "budgetMax": 15000,
  "startDate": "2024-08-01",
  "endDate": "2024-09-30",
  "applicationDeadline": "2024-07-15",
  "aiInsights": {{
    "strategy": "Focus on educational content showcasing real-world AI applications for SMBs. Partner with influencers who are trusted voices in the small business community.",
    "reasoning": "SMB owners respond well to practical advice and case studies. LinkedIn is key for B2B, YouTube for deeper explanations.",
    "successFactors": ["High-quality educational content", "Credible influencers with engaged SMB audiences", "Clear call-to-action for lead generation"],
    "potentialChallenges": ["Cutting through the noise in the AI space", "Ensuring content is accessible and not overly technical"],
    "optimizationSuggestions": ["Run A/B tests on LinkedIn ad copy", "Host a Q&A webinar with an influencer", "Repurpose video content into short clips for social media"]
  }},
  "confidence": 0.9
}}
```

Now, generate the campaign plan. Remember, ONLY the JSON object.
"""
    return prompt

# --- Helper: Generate Fallback Campaign (Python version) ---
def generate_fallback_campaign_py(requirements_data):
    print("🤖 Campaign Agent (Backend): Generating campaign using OFFLINE algorithmic strategy...")
    company_name = requirements_data.get('companyName', '[Company]')
    
    # Determine campaign industry from requirements_data.industry
    req_industry_val = requirements_data.get('industry')
    campaign_industry = 'General' # Default
    if isinstance(req_industry_val, list) and req_industry_val:
        campaign_industry = str(req_industry_val[0]) # Take the first item if it's a list
    elif isinstance(req_industry_val, str) and req_industry_val:
        campaign_industry = req_industry_val # Use as is if it's a string
    
    campaign_objective_input = requirements_data.get('campaignObjective') 
    campaign_objective_short_for_title = "Campaign"
    campaign_objective_str_for_description = "achieve business objectives"
    if isinstance(campaign_objective_input, list) and campaign_objective_input:
        campaign_objective_short_for_title = campaign_objective_input[0]
        campaign_objective_str_for_description = ", ".join(campaign_objective_input)
    elif isinstance(campaign_objective_input, str) and campaign_objective_input:
        campaign_objective_short_for_title = campaign_objective_input
        campaign_objective_str_for_description = campaign_objective_input
    
    product_service = requirements_data.get('productService', '[Product/Service]')
    campaign_audience_desc = requirements_data.get('campaignAudienceDescription', '[Campaign Target Audience - Viewers]')
    target_influencer_desc = requirements_data.get('targetInfluencerDescription', '[Target Influencer Profile - Creators]')
    budget_min = int(requirements_data.get('budgetRange', {}).get('min', 10000) * 0.8)
    budget_max = int(requirements_data.get('budgetRange', {}).get('max', 50000) * 0.9)
    from datetime import datetime, timedelta
    start_date_obj = datetime.now() + timedelta(days=7)
    end_date_obj = start_date_obj + timedelta(days=30)
    app_deadline_obj = start_date_obj - timedelta(days=3)
    platforms = requirements_data.get('preferredPlatforms', ['instagram', 'youtube'])[:2]
    
    # Use the determined campaign_industry for the niche or a general one
    first_industry_niche = campaign_industry.lower() if campaign_industry != 'General' else 'general'
    niches = list(set([first_industry_niche, 'lifestyle']))

    final_campaign_description = (
        f"Algorithmic fallback campaign to {campaign_objective_str_for_description} for {product_service}. "
        f"Targeting viewers described as: {campaign_audience_desc}. "
        f"Seeking creators like: {target_influencer_desc}."
    )
    final_campaign_brief = (
        f"This fallback campaign aims to support {company_name}'s objectives for {product_service} "
        f"targeting viewers ({campaign_audience_desc}) by collaborating with creators fitting the profile: {target_influencer_desc}, "
        f"using {', '.join(platforms)}."
    )

    return {
        "title": f"{company_name} {campaign_objective_short_for_title} Fallback Campaign",
        "brand": company_name,
        "description": final_campaign_description, # Use updated variable
        "brief": final_campaign_brief,             # Use updated variable
        "platforms": platforms,
        "minFollowers": 10000,
        "niches": niches,
        "locations": ["India"], # Default or make dynamic if needed
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
        "agentVersion": "campaign-builder-fallback-py-v1.1", # Updated version to reflect changes
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
        # Use minFollowers if present from LLM, otherwise fall back to followers, then to min_followers (database column name convention if different)
        "min_followers": campaign_payload.get("minFollowers") if campaign_payload.get("minFollowers") is not None 
                         else campaign_payload.get("followers") if campaign_payload.get("followers") is not None 
                         else campaign_payload.get("min_followers"), # Last check for direct db column name if somehow present
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
        'campaign_audience_description': original_requirements.get('campaignAudienceDescription'),
        'target_influencer_description': original_requirements.get('targetInfluencerDescription'),
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
                json_str = None
                # 1. Try to extract JSON from markdown code fence ```json ... ``` (case-insensitive for 'json')
                match_md_json = re.search(r"```json\s*(\{.*?\})\s*```", ai_message_content, re.DOTALL | re.IGNORECASE)
                if match_md_json:
                    json_str = match_md_json.group(1)
                    print("🤖 Campaign Agent (Backend): Extracted JSON from markdown code fence.")
                else:
                    # 2. If no markdown, find the first '{' and last '}' as a broader fallback
                    first_brace_index = ai_message_content.find('{')
                    last_brace_index = ai_message_content.rfind('}')
                    if first_brace_index != -1 and last_brace_index != -1 and first_brace_index < last_brace_index:
                        json_str = ai_message_content[first_brace_index : last_brace_index + 1]
                        print("🤖 Campaign Agent (Backend): Extracted JSON using first '{' and last '}'.")
                
                if not json_str:
                    raise ValueError(f"Could not find any JSON-like block in AI response. Raw content prefix: {ai_message_content[:300]}")
                
                # 3. Basic cleaning of the extracted string - strip whitespace
                json_str_cleaned = json_str.strip()
                
                # Ensure it still looks like a JSON object after stripping
                if not (json_str_cleaned.startswith("{") and json_str_cleaned.endswith("}")):
                    s_idx = json_str_cleaned.find('{')
                    e_idx = json_str_cleaned.rfind('}')
                    if s_idx != -1 and e_idx != -1 and s_idx < e_idx:
                        json_str_cleaned = json_str_cleaned[s_idx : e_idx+1]
                    else:
                        raise ValueError(f"Extracted string block does not appear to be a valid JSON object. Snippet: {json_str_cleaned[:200]}")
                
                # 4. Attempt to parse
                print(f"🤖 Campaign Agent (Backend): Attempting to parse THIS JSON string:\n---\n{json_str_cleaned}\n---") # ADDED LOG
                content = json.loads(json_str_cleaned)
                
                if not isinstance(content, dict):
                    raise ValueError(f"Parsed JSON is not a dictionary. Type: {type(content)}, Content snippet: {str(content)[:200]}")

                # 5. Validate essential keys (Update these keys to match your exact expected JSON structure from the LLM prompt)
                # Allow either 'minFollowers' (from prompt) or 'followers' (actual LLM output seen)
                essential_keys_check = ["title", "brand", "description", "brief", "platforms", 
                                 "niches", "locations", "deliverables", "budgetMin", 
                                 "budgetMax", "startDate", "endDate", "applicationDeadline", "aiInsights"]
                
                has_minfollowers_key = "minFollowers" in content
                has_followers_key = "followers" in content

                if not (has_minfollowers_key or has_followers_key):
                    # If neither key for followers is present, add one to missing_keys to trigger error
                    missing_keys = [key for key in essential_keys_check if key not in content] # Re-check without follower keys first
                    missing_keys.append("minFollowers_or_followers") # Indicate the specific lack of any follower key
                else:
                    missing_keys = [key for key in essential_keys_check if key not in content]

                if missing_keys: # If there are still missing keys after aiInsights check
                    raise ValueError(f"AI campaign response JSON missing required keys: {', '.join(missing_keys)}. Found keys: {list(content.keys())}")
                
                # Legacy adaptation (if still needed for some LLM responses)
                if "body" in content and "message" not in content:
                    content["message"] = content.pop("body")
                
                content['agentVersion'] = 'campaign-builder-py-v1.5' # increment version
                content['generatedAt'] = datetime.now(timezone.utc).isoformat()
                if 'confidence' not in content: content['confidence'] = 0.85 # Default confidence
                
                print(f"✨ Campaign Agent (Backend): AI campaign JSON successfully parsed & validated: {content.get('title')}")
                campaign_to_save = content
                generation_method = "ai_generated"
            except (json.JSONDecodeError, ValueError) as e_parse:
                error_msg = f"Error parsing or validating AI campaign JSON response: {e_parse}. Raw content snippet (first 500 chars): {ai_message_content[:500]}"
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
    ai_message_content = "" # Initialize for robust logging in except block

    if not groq_api_key:
        print("🤖 Creator Scoring (Backend): Groq API key not configured. Using fallback scoring.")
        fallback_match_data = generate_fallback_scoring_py(campaign_data, creator_data)
        return jsonify({"success": True, "creatorMatch": fallback_match_data, "method": "algorithmic_fallback"})

    prompt = build_creator_scoring_prompt(campaign_data, creator_data)
    try:
        print(f"🤖 Creator Scoring (Backend): Making AI API call for {creator_data.get('name', 'N/A')}. Prompt length: {len(prompt)}")
        headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
        payload = {
            "model": "llama3-8b-8192", # Switched to 8b for potentially better instruction following / JSON adherence
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 1500, 
            "response_format": { "type": "json_object" }
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data.get('choices', [{}])[0].get('message', {}).get('content', '')
        print(f"🤖 Creator Scoring (Backend): Raw LLM response for {creator_data.get('name', 'N/A')}:\n{ai_message_content[:1000]}...")
        
        json_str_cleaned = None
        if ai_message_content.strip().startswith("{") and ai_message_content.strip().endswith("}"):
            json_str_cleaned = ai_message_content.strip()
        else: # Try to find JSON within markdown or preamble/postamble
            match_md_json = re.search(r"```json\s*(\{.*?\})\s*```", ai_message_content, re.DOTALL | re.IGNORECASE)
            if match_md_json:
                json_str_cleaned = match_md_json.group(1).strip()
                print(f"🤖 Creator Scoring (Backend): Extracted JSON from markdown for {creator_data.get('name', 'N/A')}.")
            else:
                first_brace = ai_message_content.find('{')
                last_brace = ai_message_content.rfind('}')
                if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
                    json_str_cleaned = ai_message_content[first_brace : last_brace + 1].strip()
                    print(f"🤖 Creator Scoring (Backend): Extracted JSON using braces for {creator_data.get('name', 'N/A')}.")
        
        if not json_str_cleaned:
            raise ValueError(f"Could not find any JSON-like block in AI response for {creator_data.get('name', 'N/A')}. Raw: {ai_message_content[:300]}")

        print(f"🤖 Creator Scoring (Backend): Attempting to parse THIS JSON for {creator_data.get('name', 'N/A')}:\n---\n{json_str_cleaned}\n---")
        content = json.loads(json_str_cleaned)
        
        if not isinstance(content, dict):
            raise ValueError(f"Parsed JSON for scoring is not a dictionary for {creator_data.get('name', 'N/A')}.")

        # Validate essential keys for the scoring response
        required_keys = ["score", "reasoning", "strengths", "concerns", "fitAnalysis", "recommendedAction", "estimatedPerformance"]
        missing_keys = [key for key in required_keys if key not in content]
        if missing_keys:
            raise ValueError(f"AI scoring response JSON missing required keys: {', '.join(missing_keys)} for {creator_data.get('name', 'N/A')}. Found keys: {list(content.keys())}")
        
        # Further validation for nested structures can be added if needed
        # e.g., if not isinstance(content.get('fitAnalysis'), dict) or not content.get('fitAnalysis').get('audienceAlignment'): ...
            
        print(f"✅ Creator Scoring (Backend): AI score generated and validated for {creator_data.get('name', 'N/A')}: {content.get('score')}")
        return jsonify({"success": True, "creatorMatch": content, "method": "ai_generated"})

    except (json.JSONDecodeError, ValueError) as e_parse_validate:
        print(f"❌ Error parsing/validating AI scoring JSON for {creator_data.get('name', 'N/A')}: {e_parse_validate}. Raw content snippet: {ai_message_content[:500]}")
        fallback_match_data = generate_fallback_scoring_py(campaign_data, creator_data)
        return jsonify({"success": True, "creatorMatch": fallback_match_data, "method": "algorithmic_fallback", "error_details": str(e_parse_validate)})
    except requests.exceptions.RequestException as e_req:
        print(f"❌ Groq API request failed for creator scoring for {creator_data.get('name', 'N/A')}: {e_req}")
        fallback_match_data = generate_fallback_scoring_py(campaign_data, creator_data)
        return jsonify({"success": True, "creatorMatch": fallback_match_data, "method": "algorithmic_fallback", "error_details": str(e_req)})
    except Exception as e_gen:
        print(f"❌ Unexpected error during AI creator scoring for {creator_data.get('name', 'N/A')}: {e_gen}")
        import traceback
        traceback.print_exc()
        fallback_match_data = generate_fallback_scoring_py(campaign_data, creator_data)
        return jsonify({"success": True, "creatorMatch": fallback_match_data, "method": "algorithmic_fallback", "error_details": str(e_gen)})

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
    creator_platform = creator_data.get('platform', '[Platform]')
    # ... (other variable extractions for context are fine) ...

    prompt = f"""You are an AI tasked with generating a JSON object for an outreach email.

Use the following CREATOR PROFILE and BRAND COLLABORATION details to craft the email content:
CREATOR NAME: {creator_name}
CREATOR PLATFORM: {creator_platform}
CAMPAIGN CONTEXT: {campaign_context_str}
BRAND NAME: {brand_info_data.get('name', '[Brand Name]')}
CAMPAIGN OBJECTIVES: {", ".join(brand_info_data.get('campaignGoals', []))}
DELIVERABLES: {", ".join(brand_info_data.get('contentRequirements', []))}

IMPORTANT INSTRUCTIONS:
1. Your entire response MUST be a single, valid JSON object.
2. DO NOT include any text before or after the JSON object (e.g., no "Here is the JSON:" or ```json markdown).
3. The JSON object MUST contain exactly two keys: "subject" and "message".
4. The value for "subject" MUST be a string suitable for an email subject line.
5. The value for "message" MUST be a string containing the full email body. This string can include newlines (which should be represented as \n in the JSON string value).

Example of the REQUIRED JSON output format:
{{
  "subject": "Collaboration for {campaign_context_str} with {brand_info_data.get('name', '[Brand Name]')}",
  "message": "Hi {creator_name},\n\nI saw your content on {creator_platform} and was impressed. We at {brand_info_data.get('name', '[Brand Name]')} are running a campaign for '{campaign_context_str}' about {brand_info_data.get('campaignGoals', [])[0] if brand_info_data.get('campaignGoals') else 'our new initiative'}. We think you'd be a great fit to help create {brand_info_data.get('contentRequirements', [])[0] if brand_info_data.get('contentRequirements') else 'engaging content'}.\n\nWould you be interested in discussing this?\n\nThanks,\n[Your Name]"
}}

Generate ONLY the JSON object now based on the CREATOR and BRAND details provided above.
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
    # Add null checks for data and its properties if necessary
    if not data or not data.get('creator') or not data.get('brandInfo') or not data.get('campaignContext'):
        return jsonify({"success": False, "error": "Missing required data for initial outreach."}), 400

    creator_data = data['creator']
    brand_info_data = data['brandInfo']
    campaign_context_str = data['campaignContext']

    if not groq_api_key:
        print("🤖 Initial Outreach (Backend): Groq API key missing. Using template fallback.")
        fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback"})

    prompt = build_initial_outreach_prompt_py(creator_data, brand_info_data, campaign_context_str)
    ai_message_content = "" # Initialize to ensure it's defined for the except block's logging
    try:
        print(f"🤖 Initial Outreach (Backend): Calling Groq for {creator_data.get('name', 'N/A')}. Prompt length: {len(prompt)}")
        headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
        # Using a model known for good instruction following and JSON output if available
        payload = {"model": "llama3-8b-8192", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 1024, "response_format": { "type": "json_object" } }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        
        ai_response_data = response.json()
        ai_message_content = ai_response_data.get('choices', [{}])[0].get('message', {}).get('content', '')
        print(f"🤖 Initial Outreach (Backend): Raw LLM response for {creator_data.get('name', 'N/A')}:\n{ai_message_content[:1000]}...")

        if not ai_message_content.strip().startswith("{") or not ai_message_content.strip().endswith("}"):
            # Attempt to find the JSON block if there's preamble/postamble
            match_md_json = re.search(r"```json\s*(\{.*?\})\s*```", ai_message_content, re.DOTALL | re.IGNORECASE)
            if match_md_json:
                json_str_cleaned = match_md_json.group(1).strip()
                print(f"🤖 Initial Outreach (Backend): Extracted JSON from markdown for {creator_data.get('name', 'N/A')}.")
            else:
                first_brace_index = ai_message_content.find('{')
                last_brace_index = ai_message_content.rfind('}')
                if first_brace_index != -1 and last_brace_index != -1 and first_brace_index < last_brace_index:
                    json_str_cleaned = ai_message_content[first_brace_index : last_brace_index + 1].strip()
                    print(f"🤖 Initial Outreach (Backend): Extracted JSON using braces for {creator_data.get('name', 'N/A')}.")
                else:
                    raise ValueError(f"Could not find a valid JSON block. Raw: {ai_message_content[:300]}")
        else:
            json_str_cleaned = ai_message_content.strip()

        print(f"🤖 Initial Outreach (Backend): Attempting to parse THIS JSON for {creator_data.get('name', 'N/A')}:\n---\n{json_str_cleaned}\n---")
        content = json.loads(json_str_cleaned)
        
        if not isinstance(content, dict):
             raise ValueError(f"Parsed JSON is not a dictionary for {creator_data.get('name', 'N/A')}. Type: {type(content)}")

        if "body" in content and "message" not in content: content["message"] = content.pop("body")
        required_keys = ["subject", "message"]
        missing_keys = [key for key in required_keys if key not in content]
        if missing_keys:
            raise ValueError(f"AI initial outreach JSON missing required keys: {', '.join(missing_keys)} for {creator_data.get('name', 'N/A')}. Found: {list(content.keys())}")
        if not isinstance(content["subject"], str) or not isinstance(content["message"], str):
            raise ValueError(f"'subject' or 'message' is not a string for {creator_data.get('name', 'N/A')}.")
        
        # Correctly unindented return statement:
        return jsonify({"success": True, **content, "method": "ai_generated"})

    except (json.JSONDecodeError, ValueError) as e_parse_validate:
        print(f"❌ Error parsing/validating AI initial outreach JSON for {creator_data.get('name', 'N/A')}: {e_parse_validate}. Raw content snippet: {ai_message_content[:500]}")
        fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error_details": str(e_parse_validate)})
    except requests.exceptions.RequestException as e_req:
        print(f"❌ Groq API request failed for initial outreach for {creator_data.get('name', 'N/A')}: {e_req}")
        fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error_details": str(e_req)})
    except Exception as e_gen:
        print(f"❌ Unexpected error during AI initial outreach for {creator_data.get('name', 'N/A')}: {e_gen}")
        import traceback
        traceback.print_exc() 
        fallback_content = generate_fallback_initial_outreach_py(creator_data, brand_info_data, campaign_context_str)
        return jsonify({"success": True, **fallback_content, "method": "algorithmic_fallback", "error_details": str(e_gen)})

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
    data = request.get_json()
    to_phone_number = data.get('to_phone_number')
    message_to_speak = data.get('message') # This is the initial message from the campaign
    outreach_id = data.get('outreach_id') # This is the crucial Supabase outreach ID

    # Enhanced: Get additional context for the call session metadata
    creator_name = data.get('creator_name', 'the creator')
    brand_name = data.get('brand_name', 'our company')
    # Prioritize 'campaign_objective', fallback to 'campaign_title', then to a generic default.
    campaign_objective = data.get('campaign_objective', data.get('campaign_title', 'discuss a potential collaboration'))
    email_summary = data.get('email_conversation_summary', "No prior email conversation summary available.")

    if not all([to_phone_number, message_to_speak, outreach_id]):
        return jsonify({"success": False, "error": "Missing required fields: to_phone_number, message, outreach_id"}), 400

    if not twilio_client or not twilio_phone_number:
        return jsonify({"success": False, "error": "Twilio client not configured on backend."}), 500

    BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL")
    if not BACKEND_PUBLIC_URL:
        return jsonify({"success": False, "error": "BACKEND_PUBLIC_URL not configured in .env. Cannot set Twilio webhooks."}), 500

    current_user_id = None
    if hasattr(request, 'current_user') and request.current_user and hasattr(request.current_user, 'id'):
        current_user_id = request.current_user.id

    initial_greeting_message = message_to_speak
    elevenlabs_audio_public_url = None

    if elevenlabs_client and elevenlabs_api_key and initial_greeting_message:
        try:
            print(f"🔊 ElevenLabs: Attempting TTS for: {initial_greeting_message[:50]}...")
            unique_filename_stem = f"initial_{outreach_id.replace('-', '')}_{str(uuid.uuid4())}"
            returned_public_url, returned_local_path = generate_audio_with_elevenlabs(
                initial_greeting_message, 
                unique_filename_stem
            )
            if returned_public_url:
                elevenlabs_audio_public_url = returned_public_url
                print(f"🎧 ElevenLabs audio accessible at: {elevenlabs_audio_public_url}")
            else:
                print("⚠️ ElevenLabs: TTS generation or saving failed, will fall back to Twilio basic TTS.")
                elevenlabs_audio_public_url = None
        except Exception as e:
            print(f"❌ ElevenLabs TTS Error: {e}. Falling back to Twilio basic TTS.")
            elevenlabs_audio_public_url = None

    try:
        response = VoiceResponse()
        handle_user_speech_url_with_oid = f'{BACKEND_PUBLIC_URL}/api/voice/handle_user_speech?outreach_id={outreach_id}'
        transcription_status_url_with_oid = f'{BACKEND_PUBLIC_URL}/api/voice/transcription-status?outreach_id={outreach_id}'
        
        if elevenlabs_audio_public_url:
            response.play(elevenlabs_audio_public_url)
        else:
            response.say(initial_greeting_message, voice='Polly.Joanna-Neural')

        gather = Gather(input='speech', 
                        action=handle_user_speech_url_with_oid, 
                        method='POST', 
                        speechTimeout='5',
                        speechModel='phone_call',
                        transcribe=True,
                        transcribeCallback=transcription_status_url_with_oid
                       )
        response.append(gather)
        response.say("We didn't receive a response. If you'd like to talk, please call us back later. Goodbye.", voice='Polly.Joanna-Neural')
        response.hangup()
        twiml_to_use = str(response)

        overall_call_status_url = f'{BACKEND_PUBLIC_URL}/api/voice/recording-status?outreach_id={outreach_id}&source=call_create'

        call = twilio_client.calls.create(
            to=to_phone_number,
            from_=twilio_phone_number,
            twiml=twiml_to_use,
            status_callback=overall_call_status_url, 
            status_callback_method='POST',
            status_callback_event=['initiated', 'ringing', 'answered', 'completed'],
            record=True,
            recording_status_callback=f"{BACKEND_PUBLIC_URL}/api/voice/recording-status?outreach_id={outreach_id}&source=call_create",
            recording_status_callback_method='POST',
        )
        
        if call.sid and outreach_id and supabase_admin_client:
            initial_convo_history = [{"speaker": "ai", "text": initial_greeting_message, "timestamp": datetime.now(timezone.utc).isoformat()}]
            
            # Populate metadata with all necessary context
            call_metadata = {
                "initial_message_spoken": initial_greeting_message[:250] + "..." if len(initial_greeting_message) > 250 else initial_greeting_message,
                "creator_name": creator_name,
                "brand_name": brand_name,
                "campaign_objective": campaign_objective,
                "email_conversation_summary": email_summary
                # Add any other relevant info from `data` that might be useful for the call context
            }
            
            session_data = {
                "call_sid": call.sid,
                "outreach_id": outreach_id,
                "user_id": current_user_id,
                "status": "initiated",
                "conversation_history": initial_convo_history,
                "metadata": call_metadata # Use the populated metadata
            }
            try:
                print(f"✍️ Attempting to insert into active_call_sessions for CallSid {call.sid}: {session_data}")
                insert_response = supabase_admin_client.table("active_call_sessions").insert(session_data).execute()
                if insert_response.data:
                    print(f"✅ Call session for SID {call.sid} successfully created in Supabase.")
                else: # Changed from if not insert_response.get('data') to check error
                    # Supabase python client v2 uses model_pydantic. Vielleicht APIError.
                    # For now, let's assume if data is not present, it might indicate an error or empty response.
                    error_info = "Unknown error"
                    if hasattr(insert_response, 'error') and insert_response.error:
                        error_info = str(insert_response.error.message if hasattr(insert_response.error, 'message') else insert_response.error)
                    print(f"⚠️ Call session for SID {call.sid} - Supabase insert might have failed or returned no data. Error: {error_info}. Response: {insert_response}")

            except APIError as e_db_insert:
                print(f"❌ Supabase DB Error inserting call session for SID {call.sid}: {e_db_insert.message}. Details: {e_db_insert.details}")
            except Exception as e_db_general:
                print(f"❌ General DB Error inserting call session for SID {call.sid}: {str(e_db_general)}")

            add_supabase_conversation_message(
                outreach_id=outreach_id,
                content=initial_greeting_message,
                sender='ai',
                message_type='call_exchange',
                metadata={'call_sid': call.sid, 'speaker': 'ai', 'initial_message': True},
                user_id=current_user_id
            )
        else:
            warning_msg = "⚠️ WARNING: Could not store call session to Supabase. "
            if not call.sid: warning_msg += "CallSid missing. "
            if not outreach_id: warning_msg += "OutreachID missing. "
            if not supabase_admin_client: warning_msg += "Supabase admin client not available. "
            print(warning_msg + f"(CallSid: {call.sid}, OutreachID: {outreach_id})")


        print(f"📞 Call initiated with SID: {call.sid} to {to_phone_number}. Associated Supabase Outreach ID: {outreach_id}")
        return jsonify({"success": True, "call_sid": call.sid, "outreach_id": outreach_id, "status": "initiated", "message": "Call initiated successfully."})

    except Exception as e:
        error_message = f"Error making outbound call: {str(e)}"
        print(f"❌ {error_message}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": error_message}), 500

@app.route("/api/voice/recording-status", methods=['POST'])
def handle_recording_status():
    # --- ADD SPECIFIC LOGGING FOR record_verb source ---
    if request.args.get('source') == 'record_verb':
        call_sid_for_log = request.form.get('CallSid', 'N/A_CallSid')
        recording_sid_for_log = request.form.get('RecordingSid', 'N/A_RecSid')
        recording_url_twilio_for_log = request.form.get('RecordingUrl')
        recording_status_for_log = request.form.get('RecordingStatus', 'N/A_RecStatus') # Twilio might send RecordingStatus
        print(f"🎉 SPECIFIC LOG: handle_recording_status called with source=record_verb. CallSid: {call_sid_for_log}, RecordingSid: {recording_sid_for_log}, URL Present: {recording_url_twilio_for_log is not None}, RecordingStatus: {recording_status_for_log}")
    # --- END SPECIFIC LOGGING ---

    # Log all incoming data for debugging
    try:
        # Detailed logging as before
        form_data_str = ", ".join([f"{key}: '{value}'" for key, value in request.form.items()])
        query_params_str = ", ".join([f"{key}: '{value}'" for key, value in request.args.items()])
        log_message = (
            f"--- TWILIO RECORDING STATUS WEBHOOK RECEIVED ---\n"
            f"Timestamp: {datetime.now().isoformat()}\n"
            f"Request Method: {request.method}\n"
            f"Request URL: {request.url}\n"
            f"Request Headers: {dict(request.headers)}\n"
            f"Request Query Parameters (Args): {{{query_params_str}}}\n"
            f"Request Form Data: {{{form_data_str}}}\n"
            f"----------------------------------------------"
        )
        print(log_message)
    except Exception as e:
        print(f"Error logging request details in handle_recording_status: {e}")

    # --- Crucial: Retrieve Supabase outreach_id from query parameters ---
    outreach_id_from_query = request.args.get('outreach_id')
    callback_source = request.args.get('source', 'unknown') # e.g., 'record_verb' or 'call_create'

    call_sid = request.form.get('CallSid')
    recording_sid = request.form.get('RecordingSid')
    recording_url_twilio = request.form.get('RecordingUrl')
    recording_duration = request.form.get('RecordingDuration')
    actual_call_status = request.form.get('CallStatus')

    if not call_sid:
        print(f"🔴 CRITICAL ERROR: 'CallSid' MISSING from form data in /api/voice/recording-status. Callback source: {callback_source}. Cannot process this recording status update.")
        return jsonify({"success": False, "error": "Critical: CallSid missing from request form data."}), 400

    if not outreach_id_from_query:
        # Attempt to fetch outreach_id from active_call_sessions if missing from query, using call_sid
        print(f"⚠️ 'outreach_id' MISSING from query parameters in /api/voice/recording-status. Callback source: {callback_source}, CallSid: {call_sid}. Attempting to find it via CallSid in DB.")
        temp_call_session = None
        if supabase_admin_client:
            try:
                # Corrected fetch syntax for maybe_single()
                temp_fetch_response = supabase_admin_client.table("active_call_sessions").select("outreach_id").eq("call_sid", call_sid).maybe_single().execute()
                if temp_fetch_response.data:
                    outreach_id_from_query = temp_fetch_response.data.get('outreach_id')
                    if outreach_id_from_query:
                        print(f"✅ Found outreach_id '{outreach_id_from_query}' for CallSid {call_sid} from DB.")
                    else:
                        print(f"❌ CallSid {call_sid} found in DB, but no outreach_id associated. Cannot proceed.")
                else:
                    print(f"❌ CallSid {call_sid} not found in active_call_sessions. Cannot determine outreach_id.")
            except Exception as e_fetch_oid:
                print(f"❌ Error fetching outreach_id for CallSid {call_sid} from DB: {e_fetch_oid}")
        
        if not outreach_id_from_query:
            print(f"🔴 CRITICAL ERROR: Could not determine 'outreach_id' for CallSid {call_sid} (query & DB). Callback source: {callback_source}. Cannot reliably process this recording status update.")
            return jsonify({"success": False, "error": "Critical: outreach_id missing and could not be determined."}), 400

    print(f"🎙️ REC STATUS PARSED: Supabase Outreach ID: {outreach_id_from_query}, CallSid: {call_sid}, RecSid: {recording_sid}, ActualCallStatus: '{actual_call_status}', RecURL Present: {recording_url_twilio is not None}, Source: {callback_source}")

    call_session_data = None
    recording_processed_successfully = False
    if supabase_admin_client:
        try:
            fetch_response = supabase_admin_client.table("active_call_sessions").select("*, metadata").eq("call_sid", call_sid).maybe_single().execute()
            if fetch_response.data:
                call_session_data = fetch_response.data
                if isinstance(call_session_data.get('metadata'), dict):
                    recording_processed_successfully = call_session_data['metadata'].get("twilio_recording_processed_successfully", False)
            else:
                print(f"⚠️ No active_call_session found for CallSid {call_sid} when trying to process recording. OutreachID was {outreach_id_from_query}")
        except Exception as e_fetch_session:
            print(f"❌ Error fetching active_call_session for CallSid {call_sid}: {e_fetch_session}")
            # Proceed cautiously, or return error, depending on desired robustness

    if recording_processed_successfully:
        print(f"☑️ Recording for CallSid {call_sid} (Outreach: {outreach_id_from_query}) already marked as processed. Skipping in handle_recording_status (Source: {callback_source}).")
    elif actual_call_status == 'completed' and recording_sid and recording_url_twilio:
        print(f"✅ Call {call_sid} (Supabase Outreach: {outreach_id_from_query}) reported completed with recording details by Twilio webhook (Source: {callback_source}). Handing off to _process_and_store_twilio_recording.")
        # _process_and_store_twilio_recording will need to update the active_call_sessions record upon success
        _process_and_store_twilio_recording(
            call_sid=call_sid,
            recording_sid=recording_sid,
            recording_url_twilio=recording_url_twilio,
            outreach_id=outreach_id_from_query, # Pass the definitive outreach_id
            recording_duration_str=recording_duration
        )
    elif actual_call_status != 'completed':
        print(f"ℹ️ CallSid {call_sid} (Supabase Outreach: {outreach_id_from_query}): Call status '{actual_call_status}', not 'completed'. Recording not processed for Supabase upload yet.")
    elif not (recording_sid and recording_url_twilio):
        print(f"ℹ️ CallSid {call_sid} (Supabase Outreach: {outreach_id_from_query}): Call completed, but no RecordingSid/RecordingUrl. No recording to process for Supabase.")
    else:
        print(f"🤷 CallSid {call_sid} (Supabase Outreach: {outreach_id_from_query}): Conditions for Supabase upload not fully met. Status: '{actual_call_status}', RecSid: {recording_sid is not None}, RecUrl: {recording_url_twilio is not None}, Clients OK: {supabase_admin_client is not None and twilio_client is not None}")

    # Update the active_call_sessions record with the latest call status from this callback
    if supabase_admin_client and call_sid: # Ensure client and call_sid are available
        update_payload = {
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        current_metadata = {}
        if call_session_data and isinstance(call_session_data.get('metadata'), dict):
            current_metadata = call_session_data['metadata']
        elif call_session_data: # if metadata is not a dict, log warning but start fresh
            print(f"⚠️ Metadata for CallSid {call_sid} was not a dict or was missing. Initializing fresh metadata for this update.")
        
        current_metadata['latest_twilio_call_status'] = actual_call_status # Use a distinct key
        current_metadata['last_twilio_callback_source'] = callback_source
        if recording_sid: current_metadata['last_twilio_recording_sid'] = recording_sid
        # outreach_id should already be correct in the record, but good to be sure it matches query if possible
        update_payload['metadata'] = current_metadata
        update_payload['status'] = actual_call_status # Also update the main status field if appropriate

        try:
            print(f"💾 Attempting to update active_call_session for SID {call_sid} with recording callback info.")
            update_response = supabase_admin_client.table("active_call_sessions").update(update_payload).eq("call_sid", call_sid).execute()
            if not (hasattr(update_response, 'data') and update_response.data):
                if hasattr(update_response, 'error') and update_response.error:
                    print(f"⚠️ Supabase DB Error updating call session (recording status) for SID {call_sid}: {update_response.error.message if hasattr(update_response.error, 'message') else update_response.error}")
                else:
                    print(f"✅ Call session for SID {call_sid} (recording status) updated in Supabase (possibly minimal return).")
            else:
                 print(f"✅ Call session for SID {call_sid} (recording status) updated successfully in Supabase.")
        except Exception as e_update_rec_status:
            print(f"❌ General DB Error updating call session (recording status) for SID {call_sid}: {str(e_update_rec_status)}")
    else:
        print(f"⚠️ Cannot update active_call_session for SID {call_sid}: Supabase client or CallSid missing for final update block.")

    return jsonify({"success": True, "message": "Recording status received."}), 200

@app.route("/api/voice/transcription-status", methods=['POST'])
def handle_transcription_status():
    outreach_id_from_query = request.args.get('outreach_id')
    call_sid = request.form.get('CallSid')
    transcription_sid = request.form.get('TranscriptionSid')
    transcription_status_from_twilio = request.form.get('TranscriptionStatus') # Renamed to avoid conflict
    transcription_text = request.form.get('TranscriptionText')
    transcription_url = request.form.get('TranscriptionUrl')
    
    log_display_id = outreach_id_from_query if outreach_id_from_query else call_sid
    print(f"📝 TRANSCRIPT STATUS RECEIVED: LogDisplayID: {log_display_id}, CallSid: {call_sid}, TranSid: {transcription_sid}, Status: {transcription_status_from_twilio}")

    if not call_sid or not supabase_admin_client:
        print(f"🔴 CRITICAL: CallSid ('{call_sid}') missing or Supabase client not available. Cannot process transcript.")
        return "", 200

    call_session_data = None
    final_outreach_id = outreach_id_from_query
    current_metadata = {}
    current_conversation_history = []
    current_db_status = None

    try:
        fetch_response = supabase_admin_client.table("active_call_sessions").select("*, metadata, conversation_history, status").eq("call_sid", call_sid).maybe_single().execute()
        if fetch_response.data:
            call_session_data = fetch_response.data
            if not final_outreach_id:
                final_outreach_id = call_session_data.get('outreach_id')
            current_metadata = call_session_data.get('metadata') if isinstance(call_session_data.get('metadata'), dict) else {}
            current_conversation_history = call_session_data.get('conversation_history') if isinstance(call_session_data.get('conversation_history'), list) else []
            current_db_status = call_session_data.get('status')
            print(f"✅ Fetched active_call_session for SID {call_sid} to process transcript. OutreachID: {final_outreach_id}")
        else:
            print(f"⚠️ No active_call_session found for SID {call_sid}. Cannot associate transcript. OutreachID from query was: {outreach_id_from_query}")
            return "", 200 # Acknowledge webhook, but can't process further
    except Exception as e_fetch:
        print(f"❌ Error fetching active_call_session for SID {call_sid}: {e_fetch}. Cannot process transcript.")
        return "", 200

    if not final_outreach_id:
        print(f"🔴 CRITICAL: No usable outreach_id for CallSid {call_sid} (query: {outreach_id_from_query}, DB: {call_session_data.get('outreach_id') if call_session_data else 'N/A'}). Cannot process transcript.")
        return "", 200

    update_payload = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if transcription_status_from_twilio == 'completed' and transcription_text:
        print(f"🗣️ Transcript COMPLETED for OutreachID {final_outreach_id} (CallSid: {call_sid}):\n{transcription_text[:200]}...")
        current_metadata['twilio_transcription_text'] = transcription_text
        current_metadata['twilio_transcription_sid'] = transcription_sid
        current_metadata['twilio_transcription_status'] = transcription_status_from_twilio
        current_metadata['twilio_transcription_url'] = transcription_url
        current_metadata['twilio_transcription_error_code'] = None # Clear previous errors
        current_metadata['twilio_transcription_error_message'] = None

        # Optional: Append to conversation_history if desired.
        # This might be redundant if SpeechResult from handle_user_speech is considered the main history source.
        # If adding, ensure it's distinct.
        current_conversation_history.append({
            "speaker": "user", # Assuming transcript is usually user speech
            "text": transcription_text,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "twilio_final_transcript", # Differentiate from intermediate SpeechResult
            "transcription_sid": transcription_sid,
            "confidence": None # Confidence not typically provided with final transcript callback
        })
        update_payload['conversation_history'] = current_conversation_history
        update_payload['status'] = f"{current_db_status or 'unknown'}_transcript_completed" # Append to status

    elif transcription_status_from_twilio == 'failed':
        error_code = request.form.get('ErrorCode')
        error_message = request.form.get('ErrorMessage')
        print(f"❌ Transcription FAILED for {final_outreach_id} (CallSid: {call_sid}). Error: {error_code} - {error_message}")
        current_metadata['twilio_transcription_status'] = transcription_status_from_twilio
        current_metadata['twilio_transcription_error_code'] = error_code
        current_metadata['twilio_transcription_error_message'] = error_message
        update_payload['status'] = f"{current_db_status or 'unknown'}_transcript_failed"
    else:
        print(f"ℹ️ Transcription status for {final_outreach_id} (CallSid: {call_sid}) is '{transcription_status_from_twilio}'. Not processing as completed or failed.")
        current_metadata['twilio_transcription_status'] = transcription_status_from_twilio # Log other statuses too
    
    update_payload['metadata'] = current_metadata

    try:
        print(f"💾 Attempting to update active_call_session for SID {call_sid} with transcription info.")
        db_response = supabase_admin_client.table("active_call_sessions").update(update_payload).eq("call_sid", call_sid).execute()
        if not (hasattr(db_response, 'data') and db_response.data):
            if hasattr(db_response, 'error') and db_response.error:
                 print(f"⚠️ Supabase DB Error updating call session (transcription) for SID {call_sid}: {db_response.error.message if hasattr(db_response.error, 'message') else db_response.error}")
            else:
                 print(f"✅ Call session for SID {call_sid} (transcription) updated in Supabase (possibly minimal return).")
        else:
            print(f"✅ Call session for SID {call_sid} (transcription) updated successfully in Supabase.")
    except Exception as e_update_transcript:
        print(f"❌ General DB Error updating call session (transcription) for SID {call_sid}: {str(e_update_transcript)}")

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
    request_received_time = datetime.now()
    call_sid = request.form.get('CallSid')
    user_speech_text = request.form.get('SpeechResult', '').strip()
    speech_confidence_str = request.form.get('Confidence', '0.0')
    try:
        speech_confidence = float(speech_confidence_str)
    except ValueError:
        speech_confidence = 0.0
        print(f"⚠️ Could not parse speech_confidence: '{speech_confidence_str}'. Defaulting to 0.0 for SID {call_sid}")

    print(f"🎤 User Speech on SID {call_sid}: '{user_speech_text}', Confidence: {speech_confidence}")

    backend_public_url = os.getenv("BACKEND_PUBLIC_URL", f"http://localhost:{os.getenv('PORT', 5001)}").rstrip('/')
    action_url_for_gather = f"{backend_public_url}/api/voice/handle_user_speech"
    
    call_session_data = None
    if call_sid and supabase_admin_client:
        try:
            print(f"🔍 Fetching call session from Supabase for SID {call_sid}...")
            fetch_response = supabase_admin_client.table("active_call_sessions").select("*").eq("call_sid", call_sid).maybe_single().execute()
            if fetch_response.data:
                call_session_data = fetch_response.data
                print(f"✅ Fetched call session for SID {call_sid}: {call_session_data}")
            else:
                print(f"⚠️ No call session found in Supabase for SID {call_sid}. Response: {fetch_response}")
        except APIError as e_db_fetch:
            print(f"❌ Supabase DB Error fetching call session for SID {call_sid}: {e_db_fetch.message}. Details: {e_db_fetch.details}")
        except Exception as e_db_general_fetch:
            print(f"❌ General DB Error fetching call session for SID {call_sid}: {str(e_db_general_fetch)}")
    else:
        if not call_sid: print("❌ handle_user_speech: CallSid missing from request.")
        if not supabase_admin_client: print("❌ handle_user_speech: Supabase admin client not available.")

    if not call_session_data:
        print(f"❌ handle_user_speech: No call_session_data found for SID {call_sid} from Supabase. Cannot continue conversation.")
        response = VoiceResponse()
        response.say("I'm sorry, there was an issue retrieving our conversation context. Please try calling back later.", voice='alice')
        response.hangup()
        # ... (timing and return as before)
        function_end_time = datetime.now()
        total_function_time = (function_end_time - request_received_time).total_seconds()
        print(f"⏱️ Total time for handle_user_speech (no call_session_data path): {total_function_time:.2f}s")
        return str(response), 200, {'Content-Type': 'application/xml'}

    outreach_id_for_callbacks = call_session_data.get('outreach_id', 'unknown_outreach_id')
    current_conversation_history = call_session_data.get('conversation_history', [])
    if not isinstance(current_conversation_history, list):
        print(f"⚠️ Conversation history for SID {call_sid} is not a list: {current_conversation_history}. Resetting to empty list.")
        current_conversation_history = []

    transcription_callback_url_with_oid = f"{backend_public_url}/api/voice/transcription-status?outreach_id={outreach_id_for_callbacks}"

    # Helper function to update call session in Supabase
    def update_call_session_in_db(updated_history, status_text=None):
        if not supabase_admin_client or not call_sid:
            print("❌ Cannot update call session in DB: Supabase client or CallSid missing.")
            return False
        update_payload = {"conversation_history": updated_history, "updated_at": datetime.now(timezone.utc).isoformat()}
        if status_text:
            update_payload["status"] = status_text
        try:
            print(f"💾 Attempting to update call session for SID {call_sid} with status '{status_text}' and new history.")
            update_response = supabase_admin_client.table("active_call_sessions").update(update_payload).eq("call_sid", call_sid).execute()
            if not (hasattr(update_response, 'data') and update_response.data): # Check if data is present and not empty
                 # Supabase v2 might return an empty list in data on successful update if return="minimal"
                 # A more robust check might involve seeing if an error is present.
                if hasattr(update_response, 'error') and update_response.error:
                    print(f"⚠️ Supabase DB Error updating call session for SID {call_sid}: {update_response.error.message if hasattr(update_response.error, 'message') else update_response.error}")
                    return False
                else:
                    print(f"✅ Call session for SID {call_sid} updated in Supabase (possibly minimal return).")
                    return True # Assume success if no error
            print(f"✅ Call session for SID {call_sid} updated successfully in Supabase.")
            return True
        except APIError as e_db_update:
            print(f"❌ Supabase DB Error updating call session for SID {call_sid}: {e_db_update.message}")
            return False
        except Exception as e_db_general_update:
            print(f"❌ General DB Error updating call session for SID {call_sid}: {str(e_db_general_update)}")
            return False

    # Handle low speech confidence
    if speech_confidence < 0.4:
        print(f"👂 handle_user_speech: Low confidence ({speech_confidence}) for SID {call_sid}. Asking user to repeat.")
        ai_response_text = "I'm sorry, I didn't catch that clearly. Could you please say that again?"
        current_conversation_history.append({"speaker": "ai", "text": ai_response_text, "timestamp": datetime.now(timezone.utc).isoformat()})
        update_call_session_in_db(current_conversation_history, status_text="waiting_for_user_speech_low_conf")
        # ... (ElevenLabs and TwiML response generation as before, using ai_response_text)
        elevenlabs_audio_url = None
        if elevenlabs_client and elevenlabs_api_key:
            try:
                audio_filename_stem = f"ai_lowconf_{call_sid}_{str(uuid.uuid4())[:8]}"
                generated_url, _ = generate_audio_with_elevenlabs(ai_response_text, call_sid_for_filename=audio_filename_stem)
                elevenlabs_audio_url = generated_url
            except Exception as e_elevenlabs:
                print(f"❌ ElevenLabs TTS for low confidence repeat request failed: {e_elevenlabs}")
        response = VoiceResponse()
        if elevenlabs_audio_url:
            response.play(elevenlabs_audio_url)
        else:
            response.say(ai_response_text, voice='alice')
        gather = Gather(input='speech', action=action_url_for_gather, method='POST', speechTimeout='5', speechModel='phone_call', transcribe=True, transcribeCallback=transcription_callback_url_with_oid)
        response.append(gather)
        response.say("Sorry, I still didn't catch that. Goodbye.", voice='alice')
        response.hangup()
        function_end_time = datetime.now()
        total_function_time = (function_end_time - request_received_time).total_seconds()
        print(f"⏱️ Total time for handle_user_speech (low confidence path): {total_function_time:.2f}s")
        return str(response), 200, {'Content-Type': 'application/xml'}

    # Handle empty speech
    if not user_speech_text:
        print(f"👂 handle_user_speech: User speech was empty for SID {call_sid}. Prompting to repeat.")
        ai_response_text = "Sorry, I didn't hear anything. Could you please say that again?"
        current_conversation_history.append({"speaker": "ai", "text": ai_response_text, "timestamp": datetime.now(timezone.utc).isoformat()})
        update_call_session_in_db(current_conversation_history, status_text="waiting_for_user_speech_empty")
        # ... (ElevenLabs and TwiML response generation as before, using ai_response_text)
        elevenlabs_audio_url = None
        if elevenlabs_client and elevenlabs_api_key:
            try:
                audio_filename_stem = f"ai_emptyspeech_{call_sid}_{str(uuid.uuid4())[:8]}"
                generated_url, _ = generate_audio_with_elevenlabs(ai_response_text, call_sid_for_filename=audio_filename_stem)
                elevenlabs_audio_url = generated_url
            except Exception as e_elevenlabs:
                print(f"❌ ElevenLabs TTS for empty speech repeat request failed: {e_elevenlabs}")
        response = VoiceResponse()
        if elevenlabs_audio_url:
            response.play(elevenlabs_audio_url)
        else:
            response.say(ai_response_text, voice='alice')
        gather = Gather(input='speech', action=action_url_for_gather, method='POST', speechTimeout='5', speechModel='phone_call', transcribe=True, transcribeCallback=transcription_callback_url_with_oid)
        response.append(gather)
        response.say("We still didn't catch that. Please try calling back. Goodbye.", voice='alice')
        response.hangup()
        function_end_time = datetime.now()
        total_function_time = (function_end_time - request_received_time).total_seconds()
        print(f"⏱️ Total time for handle_user_speech (empty speech path): {total_function_time:.2f}s")
        return str(response), 200, {'Content-Type': 'application/xml'}

    # If speech is valid, append to history
    current_conversation_history.append({"speaker": "user", "text": user_speech_text, "timestamp": datetime.now(timezone.utc).isoformat()})
    # Status could be 'processing_user_speech' before LLM call
    update_call_session_in_db(current_conversation_history, status_text="processing_user_speech") 
    print(f"💬 Appended user speech to history for SID {call_sid}: '{user_speech_text}'")

    user_id_for_supabase_log = call_session_data.get('user_id')
    if outreach_id_for_callbacks and outreach_id_for_callbacks != 'unknown_outreach_id':
        add_supabase_conversation_message(
            outreach_id=outreach_id_for_callbacks,
            content=user_speech_text,
            sender='creator',
            message_type='call_exchange',
            metadata={'call_sid': call_sid, 'speaker': 'creator', 'confidence': speech_confidence},
            user_id=user_id_for_supabase_log
        )
    else:
        print(f"⚠️ Cannot log user speech to Supabase messages table: outreach_id is '{outreach_id_for_callbacks}'")

    print(f"🧠 Attempting LLM call for SID {call_sid}. User speech: '{user_speech_text}'.")
    # Pass necessary parts of call_session_data to build_live_voice_negotiation_prompt
    llm_prompt = build_live_voice_negotiation_prompt(call_session_data) # MODIFIED to pass full session data
    ai_response_text_from_llm = "I'm having a little trouble formulating a response right now. Could you try again in a moment?"
    
    # ... (Groq LLM call logic as before) ...
    if llm_prompt and groq_api_key:
        try:
            print(f"🤖 Sending prompt to Groq for SID {call_sid}")
            request_headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
            request_payload = {
                "model": "llama3-8b-8192",
                "messages": [{"role": "user", "content": llm_prompt}],
                "temperature": 0.7, "max_tokens": 150, "top_p": 1, "stream": False
            }
            start_time_groq = datetime.now()
            groq_response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=request_headers, json=request_payload)
            end_time_groq = datetime.now()
            time_taken_groq = (end_time_groq - start_time_groq).total_seconds()
            print(f"⏱️ Groq API call took: {time_taken_groq:.2f}s")
            groq_response.raise_for_status()
            groq_data = groq_response.json()
            if groq_data.get('choices') and len(groq_data['choices']) > 0:
                extracted_text = groq_data['choices'][0].get('message', {}).get('content', '').strip()
                if extracted_text:
                    ai_response_text_from_llm = extracted_text
                    print(f"🤖 LLM Response for SID {call_sid}: '{ai_response_text_from_llm}'")
                else: print(f"⚠️ LLM response was empty for SID {call_sid}.")
            else: print(f"⚠️ LLM response structure unexpected for SID {call_sid}: {groq_data}")
        except requests.exceptions.RequestException as e_groq: print(f"❌ Groq API call failed for SID {call_sid}: {e_groq}")
        except Exception as e_json: print(f"❌ Error processing Groq response for SID {call_sid}: {e_json}")
    elif not groq_api_key: print("🔴 Groq API key not configured. Using fallback response.")
    else: print(f"🔴 Failed to build LLM prompt for SID {call_sid}. Using fallback response.")

    current_conversation_history.append({"speaker": "ai", "text": ai_response_text_from_llm, "timestamp": datetime.now(timezone.utc).isoformat()})
    update_call_session_in_db(current_conversation_history, status_text="waiting_for_user_speech") # AI has responded, waiting for user again
    print(f"💬 Appended AI response to history for SID {call_sid}: '{ai_response_text_from_llm[:100]}...'")

    if outreach_id_for_callbacks and outreach_id_for_callbacks != 'unknown_outreach_id':
        add_supabase_conversation_message(
            outreach_id=outreach_id_for_callbacks,
            content=ai_response_text_from_llm,
            sender='ai',
            message_type='call_exchange',
            metadata={'call_sid': call_sid, 'speaker': 'ai'},
            user_id=user_id_for_supabase_log
        )
    else:
        print(f"⚠️ Cannot log AI response to Supabase messages table: outreach_id is '{outreach_id_for_callbacks}'")

    print(f"🔊 Attempting ElevenLabs TTS for SID {call_sid}. AI Text: '{ai_response_text_from_llm[:100]}...'.")
    elevenlabs_audio_url = None
    if elevenlabs_client and elevenlabs_api_key:
        try:
            turn_audio_filename_stem = f"ai_turn_{call_sid}_{str(uuid.uuid4())[:8]}"
            generated_url, _ = generate_audio_with_elevenlabs(
                ai_response_text_from_llm, 
                call_sid_for_filename=turn_audio_filename_stem
            )
            if generated_url:
                elevenlabs_audio_url = generated_url
                print(f"🔊 ElevenLabs audio generated for SID {call_sid}: {elevenlabs_audio_url}")
            else:
                print(f"⚠️ ElevenLabs TTS did not return a URL for SID {call_sid}. Will use Twilio TTS fallback.")
        except Exception as e_elevenlabs:
            print(f"❌ ElevenLabs TTS generation failed for SID {call_sid}: {e_elevenlabs}. Will use Twilio TTS fallback.")
    else:
        print(f"🔊 ElevenLabs client/key not available. Using Twilio basic TTS for SID {call_sid}.")

    # --- Construct Final TwiML Response ---
    final_response_twiml = VoiceResponse()
    if elevenlabs_audio_url:
        final_response_twiml.play(elevenlabs_audio_url)
    else:
        # Fallback to Twilio's basic TTS if ElevenLabs failed or is not configured
        final_response_twiml.say(ai_response_text_from_llm, voice='alice') 
    
    # Gather the user's next response
    # The action URL points back to this same function to continue the conversation.
    # transcribeCallback sends the transcript to handle_transcription_status.
    next_gather = Gather(
        input='speech', 
        action=action_url_for_gather, # Points back to this function
        method='POST', 
        speechTimeout='5', # How long to wait for speech
        speechModel='phone_call', # Optimized for phone call audio
        transcribe=True, 
        transcribeCallback=transcription_callback_url_with_oid
    )
    # Add a nested Say and Hangup within the Gather for timeout/no-input scenarios
    next_gather
    
    final_response_twiml.append(next_gather)
    final_response_twiml.hangup() # Hangup if gather times out and falls through
    
    print(f"🎬 Final TwiML (Play & Gather) for SID {call_sid} : {str(final_response_twiml)}")
    function_end_time = datetime.now()
    total_function_time = (function_end_time - request_received_time).total_seconds()
    print(f"⏱️ Total time for handle_user_speech (main conversation turn): {total_function_time:.2f}s")
    return str(final_response_twiml), 200, {'Content-Type': 'application/xml'}

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
@app.route("/api/voice/call-details", methods=['GET', 'OPTIONS']) # CHANGED: Removed 'OPTIONS' from methods -> ADDED 'OPTIONS' back
@token_required # Frontend will call this, so needs auth
def get_call_details():
    call_sid = request.args.get('call_sid')
    if not call_sid:
        return jsonify({"success": False, "error": "Missing 'call_sid' in request parameters."}), 400

    if not supabase_admin_client:
        print("❌ get_call_details: Supabase admin client not available.")
        return jsonify({"success": False, "error": "Database client not configured."}), 500

    try:
        print(f"🔍 get_call_details: Fetching call session from Supabase for SID {call_sid}...")
        fetch_response = supabase_admin_client.table("active_call_sessions").select("*").eq("call_sid", call_sid).maybe_single().execute()

        if not fetch_response.data:
            print(f"⚠️ get_call_details: Call session not found in Supabase for call_sid: {call_sid}")
            return jsonify({"success": False, "error": f"Call details not found for call_sid: {call_sid}"}), 404

        call_session = fetch_response.data
        metadata = call_session.get('metadata', {}) if isinstance(call_session.get('metadata'), dict) else {}
        
        details_payload = {
            "call_sid": call_session.get('call_sid'),
            "outreach_id": call_session.get('outreach_id'),
            "status": call_session.get('status'), # Adding status
            "conversation_history": call_session.get('conversation_history', []),
            "full_recording_url": metadata.get('twilio_recording_url'), # Mapped from metadata
            "full_recording_duration": metadata.get('twilio_recording_duration'), # Mapped from metadata
            "creator_transcript": metadata.get('twilio_transcription_text'), # Mapped from metadata for main transcript
            "creator_segment_recording_sid": metadata.get('twilio_recording_sid'), # Mapped from metadata, likely main recording SID
            "metadata": metadata, # Including the whole metadata object for frontend flexibility
            "created_at": call_session.get('created_at'),
            "updated_at": call_session.get('updated_at')
        }
        
        print(f"✅ get_call_details: Returning details for SID {call_sid}: {details_payload}")
        return jsonify({
            "success": True,
            "details": details_payload
        })

    except APIError as e_db_fetch:
        print(f"Error get_call_details: Supabase DB Error for SID {call_sid}. Message: {e_db_fetch.message}. Details: {e_db_fetch.details if hasattr(e_db_fetch, 'details') else 'N/A'}")
        return jsonify({"success": False, "error": "Database error fetching call details."}), 500
    except Exception as e_general_fetch:
        print(f"Error get_call_details: General DB Error for SID {call_sid}. Error: {str(e_general_fetch)}")
        return jsonify({"success": False, "error": "Server error fetching call details."}), 500

# --- NEW Endpoint to check call processing status ---
@app.route('/api/voice/call-progress-status', methods=['GET', 'OPTIONS']) # Add OPTIONS for CORS preflight
@token_required
def get_call_progress_status():
    # OPTIONS preflight is handled by @token_required and Flask-CORS

    call_sid = request.args.get('call_sid')
    if not call_sid:
        return jsonify({"success": False, "error": "Missing 'call_sid' in request parameters."}), 400

    if not supabase_admin_client:
        print("Error get_call_progress_status: Supabase admin client not available.")
        return jsonify({"success": False, "error": "Database client not configured."}), 500

    try:
        print(f"Info get_call_progress_status: Fetching call session for SID {call_sid}...")
        # Select only the fields needed for status determination
        fetch_response = supabase_admin_client.table("active_call_sessions") \
            .select("outreach_id, status, metadata") \
            .eq("call_sid", call_sid) \
            .maybe_single() \
            .execute()

        if not fetch_response.data:
            print(f"Info get_call_progress_status: Call session not found for SID {call_sid}. Returning status 'not_found'.")
            return jsonify({"success": True, "status": "not_found", "call_sid": call_sid}), 200

        call_session = fetch_response.data
        outreach_id = call_session.get('outreach_id')
        # Ensure metadata is a dict, default to empty dict if None or not a dict
        metadata = call_session.get('metadata') if isinstance(call_session.get('metadata'), dict) else {}
        db_status = call_session.get('status', 'unknown') # Main status from DB record

        current_progress_status = "processing" # Default status

        is_recording_processed = metadata.get('twilio_recording_processed_successfully', False)
        has_recording_url = bool(metadata.get('twilio_recording_url'))

        if is_recording_processed and has_recording_url:
            current_progress_status = "completed" # Artifacts are ready
        elif db_status in ['completed', 'failed', 'canceled', 'error_processing_recording']:
            # If the main call status indicates a terminal state from Twilio or our processing
            current_progress_status = db_status 
            if db_status == 'completed' and not (is_recording_processed and has_recording_url):
                # Twilio call completed, but our artifact processing (recording download/upload) isn't done
                current_progress_status = "processing_artifacts"
            # If db_status is 'failed', 'canceled', or 'error_processing_recording', current_progress_status will correctly reflect that.
        # If db_status is something like 'initiated', 'ringing', 'in-progress', 'waiting_for_user_speech', 
        # and recording is not yet processed, it remains 'processing'.

        print(f"Info get_call_progress_status: SID {call_sid}, DB Status: '{db_status}', Recording Processed: {is_recording_processed}, URL Present: {has_recording_url}. Determined progress: '{current_progress_status}'")
        
        return jsonify({
            "success": True, 
            "status": current_progress_status,
            "call_sid": call_sid,
            "outreach_id": outreach_id
        }), 200

    except APIError as e_db:
        print(f"Error get_call_progress_status: Supabase DB Error for SID {call_sid}. Message: {e_db.message}")
        return jsonify({"success": False, "error": "Database error checking call progress.", "call_sid": call_sid}), 500
    except Exception as e_general:
        print(f"Error get_call_progress_status: General Error for SID {call_sid}. Error: {str(e_general)}")
        return jsonify({"success": False, "error": "Server error checking call progress.", "call_sid": call_sid}), 500

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
    raw_jwt_token = request.raw_jwt
    
    print(f"ℹ️ Fetching campaigns for user_id: {current_user_id}. JWT is {'present' if raw_jwt_token else 'MISSING'}.")

    original_postgrest_headers = supabase_client.postgrest.session.headers.copy()

    try:
        if raw_jwt_token:
            print(f"💾 DEBUG: list_campaigns - Temporarily setting PostgREST auth to user's JWT. Snippet: {raw_jwt_token[:20]}...")
            supabase_client.postgrest.auth(raw_jwt_token)
        else:
            print("⚠️ WARNING: list_campaigns - No raw_jwt_token available. RLS policies using auth.uid() may not work as expected.")

        campaigns_response = (supabase_client.table('campaigns')
                                .select('*')  # MODIFIED to select all fields
                                .eq('user_id', current_user_id)
                                .order('created_at', desc=True)
                                .execute())

        print(f"💾 DEBUG: Raw Supabase response in list_campaigns: {campaigns_response}")
        if hasattr(campaigns_response, 'data'):
            print(f"💾 DEBUG: campaigns_response.data in list_campaigns: {campaigns_response.data}")
        if hasattr(campaigns_response, 'error') and campaigns_response.error:
            print(f"💾 DEBUG: campaigns_response.error in list_campaigns: {campaigns_response.error}")

        fetched_campaigns = []
        if hasattr(campaigns_response, 'data') and campaigns_response.data:
            fetched_campaigns = campaigns_response.data
        
        if not fetched_campaigns:
            print(f"ℹ️ No campaigns found for user {current_user_id} or campaigns_response.data was empty/None.")
            return jsonify({"success": True, "campaigns": []})

        # MODIFIED: Use transform_campaign_for_frontend for each campaign
        transformed_campaigns = [transform_campaign_for_frontend(campaign_row) for campaign_row in fetched_campaigns]
        
        # Filter out None results if transform_campaign_for_frontend can return None (e.g., for invalid data)
        transformed_campaigns = [c for c in transformed_campaigns if c is not None]

        print(f"✅ Fetched and transformed {len(transformed_campaigns)} campaigns for user {current_user_id}.")
        return jsonify({"success": True, "campaigns": transformed_campaigns})

    except Exception as e:
        error_message = f"Error fetching campaigns from Supabase: {type(e).__name__} - {str(e)}"
        print(f"❌ {error_message}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": error_message}), 500
    finally:
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
    original_postgrest_headers = supabase_client.postgrest.session.headers.copy()

    print(f"ℹ️ Fetching campaign with id: {campaign_id} for user_id: {current_user_id}. JWT is {'present' if raw_jwt_token else 'MISSING'}.")

    try:
        if raw_jwt_token:
            print(f"💾 DEBUG: get_campaign_by_id - Temporarily setting PostgREST auth to user's JWT. Snippet: {raw_jwt_token[:20]}...")
            supabase_client.postgrest.auth(raw_jwt_token)
        else:
            print("⚠️ WARNING: get_campaign_by_id - No raw_jwt_token available. RLS policies using auth.uid() may not work as expected.")

        # Select all fields needed by transform_campaign_for_frontend
        campaign_response = (supabase_client.table('campaigns')
                                .select('*, budget_min, budget_max, application_deadline, start_date, end_date, min_followers') # Use '*', ensure snake_case for specific fields if needed by transform
                                .eq('id', campaign_id)
                                .eq('user_id', current_user_id)
                                .maybe_single()
                                .execute())

        print(f"💾 DEBUG: Raw Supabase response in get_campaign_by_id: {campaign_response}")
        # ... (other debug logs if needed) ...

        campaign_row = None
        if hasattr(campaign_response, 'data') and campaign_response.data:
            campaign_row = campaign_response.data
        
        if not campaign_row:
            print(f"ℹ️ Campaign with id {campaign_id} not found for user {current_user_id} or response data was empty.")
            return jsonify({"success": False, "error": "Campaign not found or not authorized."}), 404

        # Use transform_campaign_for_frontend for consistent output structure
        transformed_campaign = transform_campaign_for_frontend(campaign_row)
        
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
    raw_jwt_token = request.raw_jwt 
    data = request.json
    if not data:
        return jsonify({"success": False, "error": "No data provided for update."}), 400

    allowed_ai_statuses = ['active', 'completed', 'cancelled']
    original_postgrest_headers = supabase_client.postgrest.session.headers.copy()

    try:
        supabase_client.postgrest.auth(raw_jwt_token)
        existing_campaign_response = (supabase_client.table('campaigns')
                                      .select('id, user_id, creation_method, status, industry, budget_min, budget_max, application_deadline, start_date, end_date, platforms, min_followers, niches, locations, deliverables, company_name, product_service_name, campaign_objective, target_audience, key_message')
                                      .eq('id', campaign_id)
                                      .maybe_single()
                                      .execute())
        supabase_client.postgrest.session.headers = original_postgrest_headers 

        if not existing_campaign_response.data:
            return jsonify({"success": False, "error": "Campaign not found."}), 404
        
        existing_campaign = existing_campaign_response.data

        if str(existing_campaign.get('user_id')) != str(current_user_id):
            print(f"⚠️ Authorization mismatch: User {current_user_id} tried to update campaign {campaign_id} owned by {existing_campaign.get('user_id')}.")
            return jsonify({"success": False, "error": "You are not authorized to update this campaign."}), 403

        update_payload = {}

        if existing_campaign.get('creation_method') == 'ai':
            if 'status' in data and data['status'] not in allowed_ai_statuses:
                return jsonify({
                    "success": False, 
                    "error": f"AI-generated campaigns can only have their status set to: {', '.join(allowed_ai_statuses)}."
                }), 400
            if 'status' in data:
                update_payload['status'] = data['status']
        else: 
            direct_fields = ["title", "brand", "industry", "description", "brief", "status", 
                             "company_name", "product_service_name", "campaign_objective", 
                             "target_audience", "key_message"]
            for key in direct_fields:
                if key in data:
                    update_payload[key] = data[key]
            
            if 'budget' in data and isinstance(data['budget'], dict):
                budget_data = data['budget']
                if 'min' in budget_data:
                    update_payload['budget_min'] = budget_data['min']
                if 'max' in budget_data:
                    update_payload['budget_max'] = budget_data['max']

            if 'timeline' in data and isinstance(data['timeline'], dict):
                timeline_data = data['timeline']
                if 'applicationDeadline' in timeline_data:
                    update_payload['application_deadline'] = validate_date_string(timeline_data['applicationDeadline'])
                if 'startDate' in timeline_data:
                    update_payload['start_date'] = validate_date_string(timeline_data['startDate'])
                if 'endDate' in timeline_data:
                    update_payload['end_date'] = validate_date_string(timeline_data['endDate'])

            if 'requirements' in data and isinstance(data['requirements'], dict):
                req_data = data['requirements']
                if 'platforms' in req_data:
                    update_payload['platforms'] = req_data['platforms']
                if 'minFollowers' in req_data: 
                    update_payload['min_followers'] = req_data['minFollowers'] 
                if 'niches' in req_data:
                    update_payload['niches'] = req_data['niches']
                if 'locations' in req_data:
                    update_payload['locations'] = req_data['locations']
                if 'deliverables' in req_data:
                    update_payload['deliverables'] = req_data['deliverables']

        if not update_payload:
            return jsonify({"success": False, "error": "No valid fields provided for update or operation not permitted for this campaign type."}), 400

        update_payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        print(f"💾 Updating campaign ID {campaign_id} for user {current_user_id} with payload: {json.dumps(update_payload, indent=2, default=str)}")

        supabase_client.postgrest.auth(raw_jwt_token) 
        update_response = (supabase_client.table('campaigns')
                           .update(update_payload)
                           .eq('id', campaign_id)
                           .eq('user_id', current_user_id) 
                           .execute())
        supabase_client.postgrest.session.headers = original_postgrest_headers

        if update_response.data: 
            supabase_client.postgrest.auth(raw_jwt_token) 
            updated_campaign_response = (supabase_client.table('campaigns')
                                         .select('*')
                                         .eq('id', campaign_id)
                                         .single()
                                         .execute())
            supabase_client.postgrest.session.headers = original_postgrest_headers

            if updated_campaign_response.data:
                transformed_data = transform_campaign_for_frontend(updated_campaign_response.data)
                return jsonify({"success": True, "campaign": transformed_data, "message": "Campaign updated successfully."})
            else:
                print(f"⚠️ Update reported success for campaign {campaign_id}, but failed to re-fetch. Update response: {update_response}")
                temp_merged_data = {**existing_campaign, **update_payload} 
                transformed_partial = transform_campaign_for_frontend(temp_merged_data)
                return jsonify({"success": True, "campaign": transformed_partial, "message": "Campaign updated, but re-fetch for full data failed. Displaying best available data."})
        else: 
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
        if hasattr(supabase_client, 'postgrest'): 
             supabase_client.postgrest.session.headers = original_postgrest_headers
        return jsonify({"success": False, "error": error_message}), 500

def transform_campaign_for_frontend(campaign_data):
    """Transforms a single campaign record from Supabase to a frontend-friendly format."""
    if not campaign_data:
        return None

    application_deadline = campaign_data.get('application_deadline')
    start_date = campaign_data.get('start_date')
    end_date = campaign_data.get('end_date')
    created_at = campaign_data.get('created_at')
    updated_at = campaign_data.get('updated_at')

    return {
        "id": campaign_data.get('id'),
        "title": campaign_data.get('title'),
        "brand": campaign_data.get('brand'),
        "industry": campaign_data.get('industry'), # ADDED
        "status": campaign_data.get('status'),
        "description": campaign_data.get('description'),
        "brief": campaign_data.get('brief'),
        "creation_method": campaign_data.get('creation_method'),
        "budget": {
            "min": campaign_data.get('budget_min'),
            "max": campaign_data.get('budget_max')
        },
        "timeline": {
            "applicationDeadline": application_deadline if application_deadline else None,
            "startDate": start_date if start_date else None,
            "endDate": end_date if end_date else None
        },
        "requirements": {
            "platforms": campaign_data.get('platforms', []),
            "minFollowers": campaign_data.get('min_followers'),
            "niches": campaign_data.get('niches', []),
            "locations": campaign_data.get('locations', []),
            "deliverables": campaign_data.get('deliverables', [])
        },
        "company_name": campaign_data.get('company_name'),
        "product_service_name": campaign_data.get('product_service_name'),
        "campaign_objective": campaign_data.get('campaign_objective'),
        "target_audience": campaign_data.get('target_audience'), # Assuming this was meant to be target_audience_description or similar
        "key_message": campaign_data.get('key_message'),
        "ai_insights": campaign_data.get('ai_insights'),
        "user_id": campaign_data.get('user_id'),
        "created_at": created_at if created_at else None,
        "updated_at": updated_at if updated_at else None,
        "applicants": campaign_data.get('applicants', 0),
        "selected": campaign_data.get('selected', 0)
    }

def get_common_creator_niche_examples():
    # This list should be representative of the general niche terms used in your 'creators' table.
    # Curate this list based on your actual creator data for best results.
    return ["adventure","ai","animals","art","beauty","business","cooking","crafts","creativity","dance","design","diy","education","entertainment","entrepreneurship","family","fashion","finance","fitness","food","gaming","health","home","home improvement","investing","lifestyle","music","outdoor","parenting","pets","photography","productivity","programming","science","skincare","sports","streetwear","sustainability","technology","travel","wellness","yoga"]



def build_niche_reinterpretation_prompt(specific_niches: list[str], common_niche_examples: list[str]) -> str:
    prompt = f"""You are an expert in categorizing content niches.
Given a list of specific campaign niches: {json.dumps(specific_niches)}
And a list of common creator niche examples: {json.dumps(common_niche_examples)}

Your task is to identify which of the common creator niche examples are relevant broader categories or direct matches for the given specific campaign niches.
Consider semantic similarity and hierarchical relationships (e.g., "AI in Finance" is related to both "Technology" and "Finance").

Return your answer as a JSON list of strings, containing only the relevant common niche examples from the provided list. 
If a specific campaign niche is already very common and present in the examples, include it.
If no common niche examples seem relevant, return an empty list.

Example:
Specific Campaign Niches: ["Sustainable Dog Food", "Luxury Pet Travel Accessories"]
Common Creator Niche Examples: ["pets", "food", "travel", "luxury", "sustainability", "fashion"]
Expected JSON Output: ["pets", "food", "travel", "luxury", "sustainability"]

Ensure your output is ONLY the JSON list of strings and nothing else.
"""
    return prompt

def get_broader_creator_niches_with_llm(specific_niches: list[str]):
    global groq_api_key
    if not groq_api_key or not specific_niches:
        print("⚠️ LLM Niche Reinterpretation: Groq API key missing or no specific niches provided. Returning original niches.")
        return [n.lower() for n in specific_niches] # Fallback to original specific niches (lowercased)

    common_examples = get_common_creator_niche_examples()
    prompt = build_niche_reinterpretation_prompt(specific_niches, common_examples)
    
    print(f"🧠 LLM Niche Reinterpretation: Calling Groq with prompt for niches: {specific_niches}")
    headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": "llama3-8b-8192", # Using a smaller, faster model for this task
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2, # Low temperature for more deterministic categorization
        "max_tokens": 500,
        "response_format": { "type": "json_object" } # Request JSON output if model supports
    }
    
    try:
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        ai_response_data = response.json()
        
        response_content = ai_response_data.get('choices', [{}])[0].get('message', {}).get('content', '')
        if not response_content:
            raise ValueError("LLM response content for niche reinterpretation is empty.")

        print(f"💬 LLM Niche Reinterpretation: Raw response content: {response_content}")
        
        # LLM should return a JSON string that is a list, e.g., '["tech", "finance"]'
        # We need to parse this string into a Python list.
        try:
            # The response_content itself might be a stringified JSON list.
            # Or, if the LLM wraps it in a JSON object (due to response_format: { "type": "json_object" })
            # we need to extract the list from that object.
            parsed_outer_json = json.loads(response_content)
            broader_niches_from_llm = []
            if isinstance(parsed_outer_json, list):
                broader_niches_from_llm = [str(n).lower() for n in parsed_outer_json if isinstance(n, str)]
            elif isinstance(parsed_outer_json, dict):
                # Try to find a list within the dict, e.g., under a key like 'relevant_niches' or 'result'
                # This depends on how the LLM structures its JSON object output.
                # For now, let's assume it might return a list directly or a simple object containing one.
                # This part might need adjustment based on actual LLM output with response_format json_object
                for key in parsed_outer_json:
                    if isinstance(parsed_outer_json[key], list):
                        broader_niches_from_llm = [str(n).lower() for n in parsed_outer_json[key] if isinstance(n, str)]
                        break # Take the first list found
                if not broader_niches_from_llm:
                    print(f"⚠️ LLM Niche Reinterpretation: LLM returned a JSON object, but no identifiable list of niches found. Object: {parsed_outer_json}")

            if not broader_niches_from_llm: # If parsing failed or list is empty
                 print(f"⚠️ LLM Niche Reinterpretation: Parsed list is empty or invalid. Raw: {response_content}. Using original niches.")
                 return [n.lower() for n in specific_niches]

            print(f"✅ LLM Niche Reinterpretation: Successfully reinterpreted to: {broader_niches_from_llm}")
            return broader_niches_from_llm
        except json.JSONDecodeError as e_json_inner:
            print(f"❌ LLM Niche Reinterpretation: Failed to decode JSON list from LLM response content. Error: {e_json_inner}. Content: {response_content}. Using original niches.")
            return [n.lower() for n in specific_niches]

    except requests.exceptions.RequestException as e_req:
        print(f"❌ LLM Niche Reinterpretation: API request failed: {e_req}. Using original niches.")
        return [n.lower() for n in specific_niches]
    except Exception as e_gen:
        print(f"❌ LLM Niche Reinterpretation: General error: {e_gen}. Using original niches.")
        return [n.lower() for n in specific_niches]

@app.route('/api/creators/discover', methods=['POST'])
@token_required
def discover_creators():
    if not supabase_client or not hasattr(supabase_client, 'postgrest'):
        return jsonify({"success": False, "error": "Supabase client not configured."}), 500

    criteria = request.json
    if not criteria:
        return jsonify({"success": False, "error": "No discovery criteria provided."}), 400

    print(f"ℹ️ Creator Discovery - Original criteria: {criteria}")

    active_client_for_query = supabase_admin_client if supabase_admin_client else supabase_client
    original_postgrest_headers = None
    if not supabase_admin_client:
        original_postgrest_headers = active_client_for_query.postgrest.session.headers.copy()
        active_client_for_query.postgrest.auth(request.raw_jwt)
    
    query_builder = active_client_for_query.table('creators').select('*')

    # Location Filter
    location_criteria = criteria.get('location')
    if location_criteria and isinstance(location_criteria, str):
        print(f"ℹ️ Applying DB location filter: ilike '%{location_criteria}%'")
        query_builder = query_builder.ilike('location', f"%{location_criteria}%")
    else:
        print(f"ℹ️ No location criteria provided or not a string: {location_criteria}")

    # Niche Filter
    specific_campaign_niches = criteria.get('niches')
    if specific_campaign_niches and isinstance(specific_campaign_niches, list) and len(specific_campaign_niches) > 0:
        print(f"ℹ️ Original campaign niches for discovery: {specific_campaign_niches}")
        
        # Use LLM or map to get broader/mapped creator niches.
        # get_broader_creator_niches_with_llm has a fallback to use specific_campaign_niches (lowercased) if LLM/API key is not available.
        expanded_creator_niches = get_broader_creator_niches_with_llm(specific_campaign_niches)
        
        if expanded_creator_niches and len(expanded_creator_niches) > 0:
            print(f"ℹ️ Applying DB niche filter (overlaps) with: {expanded_creator_niches} on 'niche' column.")
            # Assumes 'niche' column in 'creators' table is of array type (e.g., text[])
            query_builder = query_builder.overlaps('niche', expanded_creator_niches) 
        else:
            print(f"ℹ️ No expanded/valid niches to filter by after processing: {expanded_creator_niches}")
    else:
        print(f"ℹ️ No niche criteria provided, not a list, or empty list: {specific_campaign_niches}")

    # Verified Filter
    if 'verified' in criteria and criteria['verified'] is not None:
        if isinstance(criteria['verified'], bool):
            print(f"ℹ️ Applying DB verified filter: {criteria['verified']}")
            query_builder = query_builder.eq('verified', criteria['verified'])

    fetched_creators = []
    try:
        print(f"Executing Supabase query (before Python platform/follower filters) - Query Object: {query_builder}")
        # Fetch more candidates initially, filter in Python
        response = query_builder.limit(500).execute() 
        print(f"Supabase response (before Python filters): {response}")

        if response.data:
            fetched_creators = response.data
            print(f"ℹ️ Supabase query (before Python filters) returned {len(fetched_creators)} creators.")
        else:
            # This handles cases where response.data is None or an empty list from a successful query
            print(f"ℹ️ Supabase query (before Python filters) returned 0 creators (response.data is empty/None).")
            # If there's a specific error object in response (though data check is primary)
            if hasattr(response, 'error') and response.error:
                 print(f"⚠️ Supabase query error details: {response.error}")

    except APIError as e_api:
        print(f"❌ Supabase API Error during creator discovery: {e_api}")
        return jsonify({"success": False, "error": f"Database API error: {e_api.message}"}), 500
    except Exception as e:
        print(f"❌ Unexpected error during Supabase query execution: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Unexpected error fetching creators: {str(e)}"}), 500
    finally:
        if not supabase_admin_client and original_postgrest_headers is not None:
            active_client_for_query.postgrest.session.headers = original_postgrest_headers
            # print("Restored original PostgREST client session headers for user-context client.")

    # --- Python-based Filtering (Platforms and Followers) ---
    # (This part remains the same, it will operate on fetched_creators)
    # ... (platform filter logic) ...
    # ... (follower filter logic) ...
    # ... (return jsonify(...) logic) ...
    # For brevity, the Python filtering part is not repeated here but assume it's the same as the last correct version.
    # The critical part is to see what `fetched_creators` contains after the MODIFIED DB query.

    # --- (Existing Python filtering logic for platforms and followers would go here) ---
    # This is the Python filtering logic from the last working version for platforms and followers:
    filtered_by_python = []
    target_platforms_lower = []
    if 'platforms' in criteria and criteria['platforms']:
        if isinstance(criteria['platforms'], list):
            target_platforms_lower = [p.lower() for p in criteria['platforms']]
        elif isinstance(criteria['platforms'], str):
            target_platforms_lower = [criteria['platforms'].lower()]
    
    print(f"ℹ️ Python Filter: Target platforms (lowercase): {target_platforms_lower}")

    min_f = criteria.get('min_followers')
    max_f = criteria.get('max_followers')
    print(f"ℹ️ Python Filter: Min followers={min_f}, Max followers={max_f}")

    for creator in fetched_creators:
        passes_platform = False
        if not target_platforms_lower: # If no platform criteria, it passes
            passes_platform = True
        elif creator.get('platform') and isinstance(creator.get('platform'), str) and creator.get('platform').lower() in target_platforms_lower:
            passes_platform = True
        
        if not passes_platform:
            continue

        passes_followers = True
        current_followers = None
        if creator.get('metrics') and isinstance(creator['metrics'], dict) and 'followers' in creator['metrics']:
            try:
                current_followers = int(creator['metrics']['followers'])
            except (ValueError, TypeError):
                print(f"⚠️ Could not parse followers for creator {creator.get('id')}: {creator['metrics']['followers']}")
                passes_followers = False # Or treat as not matching if unparseable
        
        if passes_followers and current_followers is not None:
            if min_f is not None:
                try:
                    if current_followers < int(min_f):
                        passes_followers = False
                except ValueError:
                    print(f"⚠️ Invalid min_followers criteria: {min_f}")
                    passes_followers = False 
            
            if passes_followers and max_f is not None:
                try:
                    if current_followers > int(max_f):
                        passes_followers = False
                except ValueError:
                    print(f"⚠️ Invalid max_followers criteria: {max_f}")
                    passes_followers = False
        elif min_f is not None or max_f is not None: # If follower criteria exist but no follower data for creator
            passes_followers = False
            
        if passes_platform and passes_followers:
            filtered_by_python.append(creator)

    final_creators = filtered_by_python[:100] # Cap final results
    print(f"ℹ️ Found {len(final_creators)} creators after ALL filters.")
    return jsonify({"success": True, "creators": final_creators})

# --- NEW HELPER FUNCTION for Processing and Storing Twilio Recording ---
def _process_and_store_twilio_recording(call_sid, recording_sid, recording_url_twilio, outreach_id, recording_duration_str=None):
    """
    Downloads a recording from Twilio, uploads it to Supabase, 
    and updates the active_call_sessions table.
    """
    # global call_artifacts_store # REMOVED
    global supabase_admin_client # To use it
    global twilio_client # To use it

    def update_call_session_with_error(error_message_key, error_message_value, current_status="error_processing_recording"):
        if supabase_admin_client and call_sid:
            try:
                existing_session_resp = supabase_admin_client.table("active_call_sessions").select("metadata").eq("call_sid", call_sid).maybe_single().execute()
                current_metadata = {}
                if existing_session_resp.data and isinstance(existing_session_resp.data.get('metadata'), dict):
                    current_metadata = existing_session_resp.data['metadata']
                elif existing_session_resp.data: # Metadata exists but not a dict
                    print(f"⚠️ Metadata for CallSid {call_sid} was not a dict. Initializing for error update.")
                
                current_metadata[error_message_key] = error_message_value
                current_metadata['twilio_recording_processed_successfully'] = False
                
                update_payload = {
                    "metadata": current_metadata,
                    "status": current_status,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                supabase_admin_client.table("active_call_sessions").update(update_payload).eq("call_sid", call_sid).execute()
                print(f"💾 Call session for SID {call_sid} updated with error: {error_message_key}='{error_message_value}'")
            except Exception as e_update_err:
                print(f"❌❌ Nested error while updating call session with error state for SID {call_sid}: {e_update_err}")
        else:
            print(f"❌ Cannot update call session with error for SID {call_sid}: Supabase client or CallSid missing.")

    if not supabase_admin_client or not twilio_client:
        err_msg = "Supabase or Twilio client not available."
        print(f"❌ _process_and_store_twilio_recording: {err_msg} Cannot process CallSid {call_sid}.")
        update_call_session_with_error("recording_processing_error", err_msg)
        return

    print(f"⚙️ [_process_and_store_twilio_recording] Initiated for CallSid: {call_sid}, RecSid: {recording_sid}, OutreachID: {outreach_id}")

    print(f"⏳ Waiting for 5 seconds for Twilio media processing before download for CallSid {call_sid}, RecSid {recording_sid}...")
    time.sleep(5)

    try:
        print(f"⬇️ Downloading recording for CallSid {call_sid} (RecSid: {recording_sid}) from Twilio URL: {recording_url_twilio}...")
        recording_url_twilio_mp3 = recording_url_twilio
        if not recording_url_twilio.lower().endswith('.mp3'):
            if ".mp3" not in recording_url_twilio.lower():
                 recording_url_twilio_mp3 = f"{recording_url_twilio}.mp3"
                 print(f"    Adjusted Twilio Recording URL to: {recording_url_twilio_mp3} (appended .mp3)")

        recording_content_response = requests.get(
            recording_url_twilio_mp3,
            auth=(twilio_client.auth[0], twilio_client.auth[1])
        )
        recording_content_response.raise_for_status()
        recording_data = recording_content_response.content
        print(f"✅ Downloaded {len(recording_data)} bytes for CallSid {call_sid}, RecSid {recording_sid}.")

        if not recording_data:
            err_msg = "Downloaded recording was empty."
            print(f"⚠️ Recording data for CallSid {call_sid}, RecSid {recording_sid} is empty. Aborting Supabase upload.")
            update_call_session_with_error("recording_processing_error", err_msg)
            return

        storage_path = f"{outreach_id}/{call_sid}_{recording_sid}.mp3"
        print(f"⬆️ Uploading to Supabase bucket 'call-recordings' at path '{storage_path}' for CallSid {call_sid}...")
        
        supabase_admin_client.storage.from_("call-recordings").upload(
            path=storage_path,
            file=recording_data,
            file_options={"cache-control": "3600", "upsert": "true", "content-type": "audio/mpeg"}
        )
        print(f"☁️ Supabase upload initiated/completed for CallSid {call_sid}.")

        public_url_response = supabase_admin_client.storage.from_("call-recordings").get_public_url(storage_path)
        public_url_supabase = public_url_response
        print(f"🔗 Supabase Storage Public URL for CallSid {call_sid}: {public_url_supabase}")

        # Fetch existing metadata before updating
        existing_session_resp = supabase_admin_client.table("active_call_sessions").select("metadata, status").eq("call_sid", call_sid).maybe_single().execute()
        current_metadata = {}
        current_status = "call_completed_recorded" # Default status if successfully recorded

        if existing_session_resp.data:
            if isinstance(existing_session_resp.data.get('metadata'), dict):
                current_metadata = existing_session_resp.data['metadata']
            else:
                 print(f"⚠️ Metadata for CallSid {call_sid} was not a dict. Initializing for recording update.")
            # Preserve existing status unless we explicitly override it here
            current_status = existing_session_resp.data.get('status', current_status)
        else:
            print(f"⚠️ Could not fetch existing session data for CallSid {call_sid} before updating with recording. Proceeding with defaults.")

        current_metadata.update({
            "twilio_recording_url": public_url_supabase, # Changed from full_recording_url
            "twilio_recording_duration": recording_duration_str if recording_duration_str else current_metadata.get("twilio_recording_duration"),
            "twilio_recording_sid": recording_sid,
            "twilio_recording_processed_successfully": True,
            "recording_processing_error": None # Clear any previous error
        })
        
        update_payload = {
            "metadata": current_metadata,
            "status": current_status, # Keep existing status or set to completed_recorded
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        supabase_admin_client.table("active_call_sessions").update(update_payload).eq("call_sid", call_sid).execute()
        print(f"💾 Active call session for CallSid {call_sid} updated with Supabase recording URL. Supabase Outreach ID: {outreach_id}")

        if outreach_id and public_url_supabase:
            user_id_for_message = existing_session_resp.data.get('user_id') if existing_session_resp.data else None
            add_supabase_conversation_message(
                outreach_id=outreach_id,
                content=f"Call recording available. Duration: {recording_duration_str if recording_duration_str else 'N/A'}.",
                sender='system',
                message_type='call_recording',
                metadata={
                    'call_sid': call_sid, 
                    'recording_sid': recording_sid, 
                    'recording_url': public_url_supabase, 
                    'duration': recording_duration_str
                },
                user_id=user_id_for_message
            )

    except APIError as e_supabase_outer:
        err_msg = f"Supabase APIError during recording processing for CallSid {call_sid}: {e_supabase_outer.message}"
        print(f"❌ {err_msg}")
        update_call_session_with_error("recording_processing_error", err_msg)
    except requests.exceptions.RequestException as e_requests:
        err_msg = f"Network error downloading recording for CallSid {call_sid}: {e_requests}"
        print(f"❌ {err_msg}")
        update_call_session_with_error("recording_processing_error", err_msg)
    except Exception as e_general:
        err_msg = f"General error in _process_and_store_twilio_recording for CallSid {call_sid}: {str(e_general)}"
        print(f"❌ {err_msg}")
        import traceback
        traceback.print_exc()
        update_call_session_with_error("recording_processing_error", err_msg)

def add_supabase_conversation_message(outreach_id: str, content: str, sender: str, message_type: str, metadata: dict = None, user_id: str = None): # MODIFIED: Added user_id parameter
    """
    Adds a message to the Supabase conversation_messages table.

    Args:
        outreach_id: The ID of the outreach this message belongs to.
        content: The main text content of the message.
        sender: Who sent the message (e.g., 'user', 'ai', 'system', 'brand', 'creator').
        message_type: The type of message (e.g., 'call_exchange', 'voice_call_summary', 'text').
        metadata: A dictionary for any additional structured data.
        user_id: Optional ID of the user associated with this message.
    """
    if not supabase_client:
        print("❌ Supabase client not initialized. Cannot add conversation message.")
        return None

    if metadata is None:
        metadata = {}

    try:
        message_payload = {
            'outreach_id': outreach_id,
            'content': content,
            'sender': sender,
            'type': message_type,
            'metadata': metadata,
            'timestamp': datetime.now(timezone.utc).isoformat() # Supabase expects ISO format timestamp
        }
        
        # Retrieve the authenticated user's ID to set as user_id for the message
        # This assumes the function is called within a context where user info might be available
        # or that messages can also be system-generated without a specific user_id if appropriate.
        # For backend-generated messages (like AI turns or call summaries), user_id might be the system's user or null.
        # For now, let's try to get it if a Flask request context is available and has it.
        # This part might need refinement based on where this function is called from.
        # user_id = None # MODIFIED: user_id is now a parameter
        # if has_request_context(): # REMOVED this block
            # Try to get user_id from request.current_user if set by @token_required decorator
            # if hasattr(request, 'current_user') and request.current_user and hasattr(request.current_user, 'id'):
            #     user_id = request.current_user.id
            # The following lines attempting to use a global current_user or g.user without specific setup 
            # were causing 'not defined' errors. We'll rely on request.current_user set by the decorator.
            # elif hasattr(g, 'user'): # Check if 'g' has 'user' attribute
            #     g_user = getattr(g, 'user', None)
            #     if g_user and isinstance(g_user, dict) and 'id' in g_user:
            #         user_id = g_user['id']
            # elif 'current_user' in globals() and current_user and current_user.is_authenticated: # This was the problematic global current_user
            #     user_id = getattr(current_user, 'id', None)
        
        if user_id:
            message_payload['user_id'] = user_id
        else:
            # If no specific user, we might log it or decide if user_id is nullable in DB
            print(f"⚠️ No specific user_id found for conversation message for outreach {outreach_id}. User ID will be null.")

        print(f"✍️ Attempting to save conversation message to Supabase for outreach {outreach_id}: Type '{message_type}', Sender '{sender}'")
        response = supabase_client.table('conversation_messages').insert(message_payload).execute()

        if response.data:
            print(f"✅ Conversation message saved to Supabase for outreach {outreach_id}. Message ID: {response.data[0]['id']}")
            return response.data[0]
        elif response.error:
            print(f"❌ Error saving conversation message to Supabase for outreach {outreach_id}: {response.error}")
            return None
        else:
            print(f"⚠️ Unknown response when saving conversation message for outreach {outreach_id}: {response}")
            return None

    except Exception as e:
        print(f"❌ Exception in add_supabase_conversation_message for outreach {outreach_id}: {e}")
        return None

# NEW ENDPOINT for creating an outreach record from AI assignment
@app.route('/api/outreaches', methods=['POST'])
@token_required
def create_outreach_assignment():
    try:
        current_user_id = request.current_user.id
        data = request.get_json()

        campaign_id = data.get('campaign_id')
        creator_id = data.get('creator_id') # This is LLMCreatorAnalysis.creator.id from frontend
        creator_name = data.get('creator_name')
        creator_avatar = data.get('creator_avatar', None)
        creator_platform = data.get('creator_platform', None)
        creator_phone_number = data.get('creator_phone_number', None) 
        
        # Get subject and body, defaulting to empty string if not provided
        subject = data.get('subject', "")
        body = data.get('body', "")
        
        initial_status = 'identified'

        if not all([campaign_id, creator_id, creator_name]):
            app.logger.warning(f"Missing required fields for outreach creation: campaign_id={campaign_id}, creator_id={creator_id}, creator_name={creator_name}")
            return jsonify({"success": False, "error": "Missing required fields (campaign_id, creator_id, creator_name)"}), 400

        outreach_record = {
            "user_id": current_user_id,
            "campaign_id": campaign_id,
            "creator_id": creator_id,
            "creator_name": creator_name,
            "creator_avatar": creator_avatar,
            "creator_platform": creator_platform,
            "creator_phone_number": creator_phone_number,
            "subject": subject, # Explicitly add subject
            "body": body,       # Explicitly add body
            "status": initial_status,
            # Ensure other expected fields for a new outreach are present or handled
            # For example, fields that are NOT NULL in DB but not set here might cause issues
            # if they don't have DB-level defaults.
            # Based on StoredOutreach, these seem to be the core for a new assignment:
            "confidence": data.get('confidence', 0), # Default if not provided
            "reasoning": data.get('reasoning', ''),   # Default if not provided
            "key_points": data.get('keyPoints', []), # Default if not provided
            "next_steps": data.get('nextSteps', []), # Default if not provided
            "brand_name": data.get('brandName', ''), # Default if not provided (might come from campaign)
            "campaign_context": data.get('campaignContext', ''), # Default if not provided
            "notes": data.get('notes', ''), # Default if not provided
            # 'currentOffer' can be None/null
            # 'createdAt' and 'lastContact' will be set by Supabase or DB defaults ideally
        }
        
        app.logger.info(f"Attempting to insert outreach record: {outreach_record} by user {current_user_id}")

        if not supabase_admin_client:
            app.logger.error("Supabase admin client not initialized. Cannot create outreach.")
            return jsonify({"success": False, "error": "Backend configuration error (supabase admin client)."}), 500
            
        insert_response = supabase_admin_client.table('outreaches').insert(outreach_record).execute()
        
        app.logger.debug(f"Supabase insert response for outreach: {insert_response}")

        if hasattr(insert_response, 'data') and insert_response.data and len(insert_response.data) > 0:
            app.logger.info(f"Successfully created outreach ID: {insert_response.data[0].get('id')} for creator {creator_id} and campaign {campaign_id}")
            return jsonify({"success": True, "message": "Creator assigned and outreach record created.", "outreach": insert_response.data[0]}), 201
        
        # More detailed error logging based on actual Supabase Python client behavior
        error_message = "Failed to create outreach record."
        if hasattr(insert_response, 'error') and insert_response.error:
            error_message = getattr(insert_response.error, 'message', str(insert_response.error))
            app.logger.error(f"Supabase error during outreach insert: Code: {getattr(insert_response.error, 'code', 'N/A')}, Message: {error_message}")
        elif not (hasattr(insert_response, 'data') and insert_response.data):
             app.logger.error(f"Supabase returned no data and no error for outreach insert: {insert_response}")
             error_message = "Supabase returned no data and no explicit error."
        else: # Should not happen if data is present
            app.logger.error(f"Unexpected Supabase response structure for outreach insert: {insert_response}")
            error_message = "Unexpected response from database."

        return jsonify({"success": False, "error": error_message}), 500

    except Exception as e:
        app.logger.error(f"Exception in /api/outreaches POST: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": f"An unexpected error occurred: {str(e)}"}), 500

# END OF NEW ENDPOINT

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
        "creation_method": "human" 
    }

    for key in ['title', 'brand', 'industry', 'description', 'brief', 'status']:
        if key in data and data[key] is not None:
            db_insert_payload[key] = data[key]
        elif key == 'status' and 'status' not in data : 
             db_insert_payload[key] = 'draft' 

    budget_data = data.get('budget')
    if budget_data and isinstance(budget_data, dict):
        if 'min' in budget_data and budget_data['min'] is not None:
            db_insert_payload['budget_min'] = budget_data['min']
        if 'max' in budget_data and budget_data['max'] is not None:
            db_insert_payload['budget_max'] = budget_data['max']

    timeline_data = data.get('timeline')
    if timeline_data and isinstance(timeline_data, dict):
        for key, db_key in [('applicationDeadline', 'application_deadline'),
                             ('startDate', 'start_date'),
                             ('endDate', 'end_date')]:
            if key in timeline_data and timeline_data[key]:
                db_insert_payload[db_key] = validate_date_string(timeline_data[key])

    requirements_data = data.get('requirements')
    if requirements_data and isinstance(requirements_data, dict):
        for key, db_key in [('platforms', 'platforms'),
                             ('minFollowers', 'min_followers'),
                             ('niches', 'niches'),
                             ('locations', 'locations'),
                             ('deliverables', 'deliverables')]:
            if key in requirements_data and requirements_data[key] is not None:
                 db_insert_payload[db_key] = requirements_data[key]
    
    if not supabase_client or not hasattr(supabase_client, 'postgrest'):
        return jsonify({"success": False, "error": "Supabase client not configured"}), 500

    original_postgrest_headers = supabase_client.postgrest.session.headers.copy()
    try:
        if raw_jwt_token:
            supabase_client.postgrest.auth(raw_jwt_token)
        
        insert_response = supabase_client.table('campaigns').insert(db_insert_payload).execute()

        if hasattr(insert_response, 'data') and insert_response.data:
            created_campaign_raw = insert_response.data[0]
            transformed_campaign = transform_campaign_for_frontend(created_campaign_raw) # Use the helper
            return jsonify({"success": True, "campaign": transformed_campaign}), 201
        else:
            error_msg = "Failed to create campaign in database."
            if hasattr(insert_response, 'error') and insert_response.error:
                 error_details = getattr(insert_response.error, 'message', str(insert_response.error))
                 error_msg += f" Details: {error_details}"
            elif hasattr(insert_response, 'status_code'): 
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

# --- Google OAuth Routes --- START ---
@app.route('/api/auth/google/login')
@token_required
def google_login():
    app.logger.error("--- google_login: ENTERING ---")
    user_id = None
    # Try to get user_id from request.current_user (set by @token_required)
    if hasattr(request, 'current_user') and request.current_user and 'id' in request.current_user:
        user_id = request.current_user['id']
        app.logger.error(f"--- google_login: User ID from request.current_user.id: {user_id} ---")
    else:
        app.logger.error("--- google_login: User context not available from request.current_user or missing 'id'. This should not happen if @token_required ran successfully. ---")
        # Explicitly create response for error case as well
        error_resp = make_response(jsonify({"error": "User context not available for initiating Google OAuth."}), 401)
        return error_resp

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_OAUTH_REDIRECT_URI:
        app.logger.error("--- google_login: Google OAuth credentials or redirect URI are not configured on the server. ---")
        # Explicitly create response for error case
        error_resp = make_response(jsonify({"error": "Google OAuth not configured on server."}), 500)
        return error_resp

    # Create a state token to prevent CSRF.
    # Store it in the session for later validation.
    state = secrets.token_urlsafe(32)
    flask_session['oauth_state'] = state
    flask_session['oauth_user_id'] = user_id # Store user_id to link back after callback
    flask_session.modified = True 
    app.logger.error(f"--- google_login: Stored in flask_session: oauth_state='{state}', oauth_user_id='{user_id}'. Session modified: {flask_session.modified} ---")
    app.logger.error(f"--- google_login: Current flask_session content: {dict(flask_session)} ---")


    flow = GoogleFlow.from_client_config(
        client_config={
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token", # Corrected token URI
                "redirect_uris": [GOOGLE_OAUTH_REDIRECT_URI],
            }
        },
        scopes=GOOGLE_OAUTH_SCOPES,
        state=state
    )
    flow.redirect_uri = GOOGLE_OAUTH_REDIRECT_URI

    authorization_url, generated_state = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        include_granted_scopes='true'
    )
    
    # Verify that the state generated by flow.authorization_url matches the one we stored
    if generated_state != state:
        app.logger.error(f"--- google_login: CRITICAL CSRF ALERT! State mismatch before redirect. Session state: '{state}', Flow generated state: '{generated_state}' ---")
        # Explicitly create response for error case
        error_resp = make_response(jsonify({"error": "CSRF state mismatch detected before authorization."}), 500)
        return error_resp

    app.logger.error(f"--- google_login: Authorization URL generated: {authorization_url}. State used by flow: {generated_state} (matches session state) ---")
    
    # Log the security check and SECRET_KEY before returning
    app.logger.error(f"--- google_login: Security check: request.is_secure={request.is_secure}, request.scheme={request.scheme}, request.host={request.host}, SERVER_NAME={app.config.get('SERVER_NAME')}, SESSION_COOKIE_DOMAIN={app.config.get('SESSION_COOKIE_DOMAIN')} ---")
    app.logger.error(f"--- google_login: Value of app.config['SECRET_KEY'] before returning: '{app.config.get('SECRET_KEY')}' ---")

    # *** MODIFICATION: Explicitly create response and save session to it ***
    response_payload = {"authorization_url": authorization_url, "state": state}
    resp = make_response(jsonify(response_payload), 200) # Status code 200
    app.logger.error(f"--- google_login: Created make_response object (id={id(resp)}) with status 200 ---")

    app.logger.error("--- google_login: Attempting to MANUALLY call app.session_interface.save_session() on this response object ---")
    try:
        # We need to ensure flask_session is not None and modified is True,
        # and also that should_set_cookie would be True.
        should_set = False
        if flask_session is not None:
            # Ensure flask_session.modified is explicitly checked if should_set_cookie doesn't implicitly
            app.logger.error(f"  (google_login) flask_session.modified: {flask_session.modified}")
            if app.session_interface.should_set_cookie(app, flask_session):
                should_set = True
        
        if should_set:
            app.logger.error(f"  (google_login) Proceeding with manual save_session call (should_set_cookie: True, flask_session.modified: {flask_session.modified})")
            app.session_interface.save_session(app, flask_session, resp) # Save to our 'resp'
            app.logger.error(f"--- google_login: Manual save_session call completed. Cookies on resp (id={id(resp)}): {resp.headers.getlist('Set-Cookie')} ---")
        elif flask_session is None:
            app.logger.error("--- google_login: Manual save_session call SKIPPED (flask_session is None) ---")
        else: # flask_session exists but conditions not met (e.g. not modified, or should_set_cookie is false)
            app.logger.error(f"--- google_login: Manual save_session call SKIPPED (should_set_cookie: {app.session_interface.should_set_cookie(app, flask_session)}, flask_session.modified: {flask_session.modified}) ---")
    except Exception as e_save:
        app.logger.error(f"--- google_login: EXCEPTION during manual save_session: {e_save} ---", exc_info=True)
    
    app.logger.error(f"--- google_login: RETURNING response object (id={id(resp)}) ---")
    return resp
@app.route('/api/oauth2callback/google') 
# @token_required # Commented out as per previous correct version, we use flask_session for state
def google_oauth2callback(): # token_required removed based on previous working version. User context if needed comes after state check.
    # REMOVING previous print/app.logger.info statements from the beginning of this function as they were not visible.
    # Focusing on enhancing the error log we CAN see.

    session_state = flask_session.pop('oauth_state', None)
    received_state = request.args.get('state')

    # This app.logger.info might also not be visible, but keeping it for now, slightly modified.
    app.logger.info(f"OAuth Callback: Post-pop session_state: '{session_state}', Google state: '{received_state}'")

    if not session_state or session_state != received_state:
        # ENHANCED ERROR LOGGING HERE
        current_session_content_at_error = "<Error converting session to dict>"
        try:
            current_session_content_at_error = dict(flask_session) # Session after pop attempt
        except Exception as e_dict_session:
            current_session_content_at_error = f"Error converting session to dict: {str(e_dict_session)}"
        
        request_cookies_at_error = "<Error converting cookies to dict>"
        try:
            request_cookies_at_error = request.cookies.to_dict()
        except Exception as e_dict_cookies:
            request_cookies_at_error = f"Error converting cookies to dict: {str(e_dict_cookies)}"

        error_message = (
            f"OAuth callback state mismatch. "
            f"Popped 'oauth_state' from session was: '{session_state}'. " # This will be None if it wasn't found
            f"Received state from Google: '{received_state}'. "
            f"Current flask_session content (after pop attempt): {current_session_content_at_error}. "
            f"Request cookies at error: {request_cookies_at_error}."
        )
        app.logger.error(error_message)
        # Adding detailed_error query param for frontend, if it wants to display more info (optional)
        return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?error=oauth_state_mismatch_detailed")

    if 'error' in request.args:
        error_reason = request.args.get('error', 'Unknown error')
        app.logger.warning(f"Google OAuth permission denied or an error occurred during callback: {error_reason}")
        return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?error=google_auth_denied&reason={error_reason}")

    # Initialize flow with client config, consistent with google_login
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_OAUTH_REDIRECT_URI]
        }
    }
    try:
        flow = GoogleFlow.from_client_config(
            client_config=client_config,
            scopes=GOOGLE_OAUTH_SCOPES,
            state=session_state # Use the validated state
        )
        flow.redirect_uri = GOOGLE_OAUTH_REDIRECT_URI

        flow.fetch_token(code=request.args.get('code'))
    except google.auth.exceptions.OAuthError as oauth_error:
        app.logger.error(f"OAuthError during token fetch: {oauth_error}. Details: {getattr(oauth_error, 'details', 'N/A')}", exc_info=True)
        return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?error=google_token_fetch_oauth_error&code={getattr(oauth_error, 'error_uri', '')}")
    except Exception as e:
        app.logger.error(f"Error fetching token from Google: {str(e)}", exc_info=True)
        return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?error=google_token_fetch_failed")

    credentials = flow.credentials
    
    # Retrieve the user_id stored in the session by the google_login route
    user_id = flask_session.pop('oauth_user_id', None)
    if not user_id:
        app.logger.error("User ID not found in session during OAuth callback. Cannot store tokens.")
        return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?error=oauth_session_error_user_id")
    app.logger.info(f"OAuth Callback: Retrieved user_id '{user_id}' from session for token storage.")

    try:
        # Calculate expiry_timestamp_utc
        # Google credentials.expiry is a datetime object in UTC if available
        expiry_timestamp_utc = None
        if credentials.expiry:
            expiry_timestamp_utc = credentials.expiry.isoformat()

        token_data = {
            'user_id': user_id,
            'access_token': credentials.token,
            'refresh_token': credentials.refresh_token, 
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret, 
            # CORRECTED: Store scopes directly as a Python list; Supabase client handles conversion to PG array
            'scopes': credentials.scopes, 
            'expiry_timestamp_utc': expiry_timestamp_utc, # Store calculated expiry
            'updated_at': datetime.now(timezone.utc).isoformat()
        }

        if not supabase_admin_client:
            app.logger.error("Supabase admin client not initialized. Cannot save OAuth tokens.")
            return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?error=server_config_error_token_storage")

        response = supabase_admin_client.table('user_google_oauth_tokens') \
            .upsert(token_data, on_conflict='user_id') \
            .execute()

        if response.data:
            app.logger.info(f"Successfully stored/updated Google OAuth tokens for user {user_id}")
            return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?gmail_connected=true")
        else:
            error_msg = "Failed to save OAuth tokens to database."
            if hasattr(response, 'error') and response.error:
                 error_details = getattr(response.error, 'message', str(response.error))
                 error_msg += f" Details: {error_details}"
            app.logger.error(f"Error saving Google OAuth tokens for user {user_id}: {error_msg}. DB Response: {response}")
            return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?error=db_token_save_failed")

    except Exception as e:
        app.logger.error(f"Error processing and storing Google OAuth credentials for user {user_id}: {str(e)}", exc_info=True)
        return redirect(f"{os.getenv('VITE_FRONTEND_URL', 'http://localhost:5173')}/settings?error=oauth_processing_error&detail={str(e)[:100]}")
# --- Google OAuth Routes --- END ---

# --- API Endpoint to Send Outreach via Gmail --- START ---
@app.route('/api/outreach/send-via-gmail', methods=['POST'])
@token_required
def handle_send_outreach_via_gmail():
    user_id = request.current_user.id
    data = request.get_json()

    # MODIFIED: Validate new payload
    required_keys = ['outreach_id', 'conversation_message_id', 'subject', 'body']
    if not data or not all(k in data for k in required_keys):
        missing_keys = [k for k in required_keys if k not in (data or {})]
        return jsonify({"success": False, "error": f"Missing required keys in request: {', '.join(missing_keys)}"}), 400
    
    outreach_id = data['outreach_id']
    conversation_message_id = data['conversation_message_id']
    email_subject_from_payload = data['subject']
    email_body_from_payload = data['body']

    app.logger.info(f"User {user_id} attempting to send email for outreach_id {outreach_id} (conversation_message_id: {conversation_message_id}) via Gmail.")

    google_credentials = get_google_user_credentials(user_id)
    if not google_credentials:
        app.logger.warning(f"User {user_id} does not have valid Google credentials for outreach {outreach_id}.")
        # Update conversation_message status to failed before returning
        update_conversation_message_metadata(conversation_message_id, {
            'gmail_send_status': 'failed_gmail_send',
            'error_message': 'Gmail account not connected or needs re-authentication.'
        })
        return jsonify({
            "success": False, 
            "error": "Gmail account not connected or needs re-authentication. Please connect your Gmail account in settings.",
            "action_required": "connect_gmail"
        }), 403

    if not supabase_admin_client:
        app.logger.error("Supabase ADMIN client not initialized. Cannot fetch outreach details for Gmail send.")
        # Update conversation_message status to failed before returning
        update_conversation_message_metadata(conversation_message_id, {
            'gmail_send_status': 'failed_gmail_send',
            'error_message': 'Server configuration error (Supabase admin client).'
        })
        return jsonify({"success": False, "error": "Server configuration error (Supabase admin client)."}), 500
    
    recipient_email = None
    try:
        # Fetch only creator's email and verify ownership using outreach_id
        # No longer need to fetch subject/body from outreaches table for sending
        outreach_response = supabase_admin_client.table('outreaches').select(
            'id, user_id, creators(email)' # Only select what's needed
        ).eq('id', outreach_id).maybe_single().execute()

        if not outreach_response.data:
            error_msg = f"Outreach record {outreach_id} not found."
            app.logger.warning(f"{error_msg} (Admin client used). User {user_id}.")
            update_conversation_message_metadata(conversation_message_id, {'gmail_send_status': 'failed_gmail_send', 'error_message': error_msg})
            return jsonify({"success": False, "error": error_msg}), 404

        outreach_owner_id = outreach_response.data.get('user_id')
        if str(outreach_owner_id) != str(user_id):
            error_msg = f"Ownership mismatch: User {user_id} cannot send email for outreach {outreach_id} owned by {outreach_owner_id}."
            app.logger.error(error_msg)
            update_conversation_message_metadata(conversation_message_id, {'gmail_send_status': 'failed_gmail_send', 'error_message': 'Access denied to outreach record due to ownership mismatch.'})
            return jsonify({"success": False, "error": "Access denied to outreach record."}), 403

        creator_details = outreach_response.data.get('creators')
        if not creator_details or not creator_details.get('email'):
            error_msg = f"Creator email missing for outreach {outreach_id}."
            app.logger.warning(f"{error_msg} Creator details from DB: {creator_details}")
            update_conversation_message_metadata(conversation_message_id, {'gmail_send_status': 'failed_gmail_send', 'error_message': error_msg})
            return jsonify({"success": False, "error": error_msg}), 400
        
        recipient_email = creator_details['email']
        app.logger.info(f"Proceeding to send email to {recipient_email} using subject/body from payload for conv_msg_id {conversation_message_id}.")

    except APIError as e:
        error_msg = f"Supabase APIError during outreach/creator fetch for {outreach_id}: {e.message}"
        app.logger.error(error_msg, exc_info=True)
        update_conversation_message_metadata(conversation_message_id, {'gmail_send_status': 'failed_gmail_send', 'error_message': error_msg})
        return jsonify({"success": False, "error": f"Database API error: {e.message}"}), 500
    except Exception as e:
        error_msg = f"Unexpected error during outreach/creator fetch for {outreach_id}: {str(e)}"
        app.logger.error(error_msg, exc_info=True)
        update_conversation_message_metadata(conversation_message_id, {'gmail_send_status': 'failed_gmail_send', 'error_message': error_msg})
        return jsonify({"success": False, "error": "Unexpected server error fetching recipient details."}), 500

    # Call the modified send_gmail_email function using subject and body from payload
    send_result = send_gmail_email(
        credentials=google_credentials, 
        to_email=recipient_email, 
        subject=email_subject_from_payload, 
        message_text=email_body_from_payload
    )

    if send_result["success"]:
        app.logger.info(f"Email sent successfully for conv_msg_id {conversation_message_id}. Gmail ID: {send_result.get('message_id')}")
        update_conversation_message_metadata(conversation_message_id, {
            'gmail_send_status': 'sent_via_gmail',
            'gmail_message_id': send_result.get('message_id'),
            'error_message': None # Clear any previous error
        })
        return jsonify({
            "success": True, 
            "message": f"Email successfully sent to {recipient_email} via Gmail.",
            "gmail_message_id": send_result.get('message_id')
        }), 200
    else:
        error_detail_from_send = send_result.get("error", "Unknown error from send_gmail_email function.")
        app.logger.error(f"Failed to send email for conv_msg_id {conversation_message_id}: {error_detail_from_send}")
        update_conversation_message_metadata(conversation_message_id, {
            'gmail_send_status': 'failed_gmail_send',
            'error_message': error_detail_from_send
        })
        return jsonify({
            "success": False, 
            "error": f"Failed to send email via Gmail: {error_detail_from_send}"
        }), 500

# --- API Endpoint to Send Outreach via Gmail --- END ---
# ... existing code ...

# --- Google Auth Status API Endpoint --- START ---
@app.route('/api/auth/google/status', methods=['GET'])
@token_required
def get_google_auth_status():
    # REPLACED app.logger with print(..., flush=True)
    user_id = request.current_user.id
    print(f"--- get_google_auth_status: Checking Google Auth status for user_id: {user_id} ---", flush=True)
    
    credentials = get_google_user_credentials(user_id)
    
    if credentials and credentials.valid:
        print(f"User {user_id}: IS connected to Google and credentials are valid.", flush=True)
        return jsonify({"success": True, "is_connected": True})
    elif credentials and not credentials.valid:
        print(f"User {user_id}: WARNING - Has Google token record, but credentials NOT valid.", flush=True)
        return jsonify({"success": True, "is_connected": False, "message": "Google connection found but requires re-authentication."})
    else:
        print(f"User {user_id}: IS NOT connected to Google (no valid tokens or error retrieving).", flush=True)
        return jsonify({"success": True, "is_connected": False, "message": "User not connected to Google."})

# --- Helper function to send email via Gmail API ---
def send_gmail_email(credentials: GoogleCredentials, to_email: str, subject: str, message_text: str, from_email: str = 'me') -> dict: # MODIFIED return type
    """
    Sends an email using the Gmail API with the provided credentials.

    Args:
        credentials: The Google OAuth2 credentials for the user.
        to_email: The recipient's email address.
        subject: The subject of the email.
        message_text: The body of the email (can be plain text or HTML).
        from_email: The sender's email address (usually 'me' for the authenticated user).

    Returns:
        A dictionary: {"success": True, "message_id": "gmail_message_id"} on success,
                     {"success": False, "error": "error description"} on failure.
    """
    if not credentials or not credentials.valid:
        error_msg = f"Attempted to send Gmail with invalid or missing credentials. Valid: {credentials.valid if credentials else 'N/A'}"
        print(f"Error: {error_msg}", flush=True)
        if credentials and not credentials.token:
             print("Error: Access token is missing from Google credentials.", flush=True)
        return {"success": False, "error": error_msg}
    
    try:
        service = build_google_api_service('gmail', 'v1', credentials=credentials)
        
        mime_message = MIMEText(message_text, 'plain') 
        mime_message['to'] = to_email
        mime_message['from'] = from_email
        mime_message['subject'] = subject
        
        raw_message = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()
        message_body = {'raw': raw_message}
        
        sent_message = service.users().messages().send(userId=from_email, body=message_body).execute()
        gmail_message_id = sent_message.get('id')
        
        if gmail_message_id:
            print(f"Email sent successfully. Message ID: {gmail_message_id}", flush=True)
            return {"success": True, "message_id": gmail_message_id}
        else:
            # This case should ideally not happen if execute() doesn't raise an error and returns a response
            error_msg = "Gmail API executed send but returned no message ID."
            print(f"Error: {error_msg}", flush=True)
            return {"success": False, "error": error_msg}

    except HttpError as error:
        error_details = f"Gmail API HttpError: {error.status_code} - {error.reason}. Content: {error.content.decode() if error.content else 'N/A'}"
        print(f"Error sending email via Gmail: {error_details}", flush=True)
        return {"success": False, "error": error_details}
    except Exception as e:
        error_details = f"Unexpected error in send_gmail_email: {str(e)}"
        print(f"Error: {error_details}", flush=True)
        return {"success": False, "error": error_details}

# NEW Helper function to update metadata in conversation_messages
def update_conversation_message_metadata(conversation_message_id: str, metadata_updates: dict) -> bool:
    """
    Updates the metadata for a specific message in the conversation_messages table.
    It fetches existing metadata, merges it with updates, and saves it back.
    """
    if not supabase_admin_client: # Use admin client for system-level updates
        print("❌ Supabase ADMIN client not initialized. Cannot update conversation_message metadata.", flush=True)
        return False

    try:
        # Fetch existing metadata
        msg_response = supabase_admin_client.table('conversation_messages').select('metadata').eq('id', conversation_message_id).maybe_single().execute()

        if not msg_response.data:
            print(f"❌ Conversation message with ID {conversation_message_id} not found for metadata update.", flush=True)
            return False

        existing_metadata = msg_response.data.get('metadata', {})
        if not isinstance(existing_metadata, dict): # Ensure it's a dict
             print(f"⚠️ Metadata for message {conversation_message_id} was not a dict, re-initializing. Original: {existing_metadata}", flush=True)
             existing_metadata = {}
        
        # Merge new updates into existing metadata
        updated_metadata = {**existing_metadata, **metadata_updates}

        # Update the record
        update_response = supabase_admin_client.table('conversation_messages').update({'metadata': updated_metadata}).eq('id', conversation_message_id).execute()

        if hasattr(update_response, 'data') and update_response.data: # In v2, data is a list
            print(f"✅ Metadata updated for conversation_message {conversation_message_id}.", flush=True)
            return True
        elif hasattr(update_response, 'error') and update_response.error:
            print(f"❌ Error updating metadata for conversation_message {conversation_message_id}: {update_response.error}", flush=True)
            return False
        else: # Should not happen if data or error is always present
            print(f"⚠️ Unknown response from Supabase during metadata update for {conversation_message_id}. Data: {getattr(update_response, 'data', 'N/A')}", flush=True)
            return False
            
    except APIError as e_api:
        print(f"❌ Supabase APIError updating metadata for {conversation_message_id}: {e_api.message}", flush=True)
        return False
    except Exception as e:
        print(f"❌ Unexpected error in update_conversation_message_metadata for {conversation_message_id}: {str(e)}", flush=True)
        return False

# Ensure this function is defined before its first use in handle_send_outreach_via_gmail
# ... existing code ...

if __name__ == '__main__':
    app.run(debug=True, port=int(os.getenv('PORT', 5001)))