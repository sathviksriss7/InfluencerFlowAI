import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Derive the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct the path to .env.local in the project root
// Goes up two levels from src/scripts/ to the project root
const envPath = path.resolve(__dirname, '..', '..', '.env.local');

console.log(`Attempting to load .env file from: ${envPath}`);
const dotenvResult = dotenv.config({ path: envPath }); 

console.log("Starting populateSupabase.ts script...");

// Log the result of dotenv.config()
console.log("Dotenv config result:", JSON.stringify(dotenvResult, null, 2));

// Log all environment variables to see what was loaded (BE CAREFUL WITH SENSITIVE DATA IN LOGS)
// In a real scenario, you might only log specific keys or check if they exist.
// For debugging, let's see if the relevant keys appear.
console.log("VITE_SUPABASE_URL (from process.env after dotenv):");
console.log(process.env.VITE_SUPABASE_URL);
console.log("VITE_SUPABASE_SERVICE_KEY (from process.env after dotenv):");
console.log(process.env.VITE_SUPABASE_SERVICE_KEY);

import { mockCreators } from '../mock-data/creators';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client here with your URL and SERVICE_ROLE_KEY for backend script
// IMPORTANT: Use your SERVICE_ROLE_KEY for a script like this to bypass RLS if needed for inserts.
// DO NOT commit this key to git. Load from environment variables for scripts.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY;

console.log("Supabase URL assigned to const:", SUPABASE_URL);
console.log("Supabase Service Key assigned to const is set:", !!SUPABASE_SERVICE_KEY);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("CRITICAL ERROR: Supabase URL or Service Key not found in environment variables after dotenv processing.");
  if (dotenvResult.error) {
    console.error("Dotenv error details:", dotenvResult.error);
  }
  console.error("Please ensure your .env.local file exists at the project root (InfluencerFlowAI/.env.local) and contains VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
console.log("Supabase client initialized.");

async function populate() {
  console.log("Inside populate function.");
  console.log(`Attempting to insert ${mockCreators.length} creators...`);
  // Supabase insert can take an array of objects directly
  // Ensure your mockCreators objects match the table structure perfectly
  // Especially for jsonb and array fields.

  // Remove id from mock data if your DB auto-generates it
  // const creatorsToInsert = mockCreators.map(({ id, ...rest }) => rest);
  // Or ensure mockCreator IDs are unique UUIDs if your ID column expects that and isn't auto-generating in a way that matches.
  // For your current SQL, ID is auto-gen UUID, so best to omit `id` from insert payload.

  const creatorsToInsert = mockCreators.map(creator => {
    const { id, demographics, ...restOfCreator } = creator; // Destructure demographics separately
    
    // Map the demographics field to audience_demographics for the database
    const dbCreatorObject: any = {
      ...restOfCreator,
    };

    if (demographics) {
      dbCreatorObject.audience_demographics = demographics;
    }
    
    // Supabase client generally handles JS objects for JSONB and arrays for TEXT[] correctly.
    // No explicit stringification should be needed for metrics, rates, niche.
    return dbCreatorObject; 
  });


  // Insert in batches to be safe
  const batchSize = 50;
  for (let i = 0; i < creatorsToInsert.length; i += batchSize) {
    const batch = creatorsToInsert.slice(i, i + batchSize);
    console.log(`Inserting batch ${i / batchSize + 1}...`);
    const { data, error } = await supabase.from('creators').insert(batch);

    if (error) {
      console.error('Error inserting batch:', error);
      // Decide if you want to stop on error or continue
      // return; 
    } else {
      console.log(`Successfully inserted batch of ${batch.length} creators.`);
    }
  }
  console.log('Finished populating creators.');
}

populate().catch(err => {
    console.error("Error in populate function catch:", err);
});
