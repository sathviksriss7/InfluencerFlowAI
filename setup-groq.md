# 🚀 Groq LLM Integration Setup Guide

Welcome to the **real AI-powered** InfluencerFlowAI platform! This guide will help you set up the Groq LLM integration for lightning-fast, intelligent creator search.

## 📋 Prerequisites

- Node.js 18+ installed
- Project dependencies installed (`npm install`)
- A free Groq account

## 🔑 Step 1: Get Your Groq API Key

1. **Visit Groq Console**
   - Go to [console.groq.com](https://console.groq.com/)
   - Sign up for a free account (no credit card required)

2. **Generate API Key**
   - Navigate to the API Keys section
   - Click "Create API Key"
   - Give it a name (e.g., "InfluencerFlowAI")
   - Copy the generated key (starts with `gsk_`)

## ⚙️ Step 2: Configure Environment

1. **Create Environment File**
   ```bash
   # In your project root, create .env.local
   touch .env.local
   ```

2. **Add Your API Key**
   ```bash
   # Add this line to .env.local (replace with your actual key)
   VITE_GROQ_API_KEY="gsk_your_actual_api_key_here"
   ```

   **Example:**
   ```bash
   VITE_GROQ_API_KEY="gsk_1234567890abcdef..."
   ```

## 🧪 Step 3: Test the Integration

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Open the Application**
   - Navigate to `http://localhost:5173`
   - Go to **Creators** page
   - Click on the **"AI Search"** toggle button

3. **Verify Setup**
   - Look for the "⚡ Groq Powered" badge in AI Search mode
   - Status should show "LLM-powered natural language search"
   - No API key warning should appear

## 🎯 Step 4: Try AI-Powered Search

The Creators page now features a **unified interface** with two search modes:

### **Mode 1: Traditional Search**
- Use filters for platform, niche, follower count
- Text search by name, username, or location
- Sort by followers, engagement, rating, or name

### **Mode 2: AI Search** ⚡
Test these example queries to see the real AI in action:

### **Beginner Queries**
```
Find fitness influencers on Instagram
Show me tech reviewers on YouTube
Looking for fashion creators with high engagement
```

### **Advanced Queries**
```
Find sustainable fashion micro-influencers in New York with 50k-100k followers who create authentic lifestyle content and have high engagement rates for an eco-friendly brand campaign

Show me tech reviewers on YouTube who specialize in gadget unboxings, have over 100k subscribers, and would be perfect for launching a new smartphone accessory

Need food bloggers who create recipe content on Instagram and TikTok, focus on healthy eating, and have strong engagement with young professional audiences for a meal kit service launch
```

## 🔍 What to Expect

### **Unified Interface Benefits**
- **No Tab Confusion**: One page for all search needs
- **Easy Mode Switching**: Toggle with a single click
- **Consistent Navigation**: Same layout, different search methods
- **Progressive Enhancement**: Traditional search always works

When the LLM integration is working correctly in AI mode, you'll see:

### **Query Analysis**
- ✅ Intent extraction and understanding
- ✅ Platform and niche detection
- ✅ Confidence scoring (usually 80-95%)
- ✅ Processing time (typically under 2 seconds)

### **Intelligent Recommendations**
- 🎯 Relevance scores with detailed reasoning
- 💡 AI-generated insights about each creator
- ⚠️ Potential concerns and considerations
- 🌟 Strength analysis and recommendations

### **Dynamic Suggestions**
- 💭 Contextual improvement suggestions
- 🔄 Query refinement recommendations
- 📊 Market insights and trends

## 🛠️ Troubleshooting

### **"Setup Required" Message**
❌ **Problem**: API key warning appears in AI mode
✅ **Solution**: 
- Check `.env.local` file exists in project root
- Verify API key is correct and starts with `gsk_`
- Restart development server (`npm run dev`)

### **"Error Processing Request"**
❌ **Problem**: LLM analysis fails
✅ **Solutions**:
- Check API key is valid and active
- Verify internet connection
- Try simpler queries first
- Check Groq console for rate limits

### **No AI Search Mode Available**
❌ **Problem**: Only seeing Traditional Search mode
✅ **Solution**:
- Clear browser cache
- Restart development server
- Check console for JavaScript errors
- Verify environment variable is properly loaded

## 🚀 Performance Tips

### **Best User Experience**
- **Start with Traditional**: Use filters to get familiar with available creators
- **Switch to AI**: Try natural language queries for more sophisticated matching
- **Compare Results**: See how AI interprets your requirements vs. manual filtering
- **Iterate**: Use AI suggestions to refine your search

### **Optimize Your AI Queries**
- **Be specific**: Include platform preferences, follower ranges, niches
- **Add context**: Mention campaign goals, brand values, urgency
- **Use natural language**: Write as you would speak to a human assistant

### **Best Practices**
- Start with simple queries to test the system
- Gradually try more complex, multi-criteria searches
- Pay attention to confidence scores and AI suggestions
- Use the "Show Details" option for deeper insights

## 📊 Free Tier Limits

Groq's free tier is generous for development:
- **Model**: Llama 3.3 70B (state-of-the-art)
- **Speed**: Sub-second inference
- **Rate Limits**: Sufficient for testing and development
- **Cost**: Free for getting started

## 🎓 Advanced Usage

### **Query Examples by Use Case**

**Brand Awareness Campaign:**
```
Find macro influencers across Instagram and YouTube with 500k+ followers who create lifestyle content and have strong brand partnership history for a luxury watch brand awareness campaign
```

**Product Launch:**
```
Need tech influencers who create unboxing and review content, have audiences interested in productivity tools, and can showcase a new smart device for pre-launch buzz
```

**Niche Targeting:**
```
Show me sustainable living micro-influencers on Instagram and TikTok who promote eco-friendly products, have engaged communities interested in zero-waste lifestyle, and align with environmental brand values
```

## 🆘 Support

### **Common Issues**
- Environment variable not loading → Restart dev server
- API rate limits → Wait a few minutes and try again  
- JSON parsing errors → Usually temporary, try again

### **Getting Help**
- Check the browser console for detailed error messages
- Verify API key in Groq console is active
- Test with simpler queries first
- Ensure `.env.local` is in the correct location

## 🎉 Success!

Once everything is working, you'll have access to:
- **Seamless creator discovery** with both traditional and AI search
- **Real AI-powered recommendations** with natural language understanding
- **Lightning-fast responses** powered by Groq's optimized hardware
- **Intelligent insights** that adapt to your specific needs
- **Contextual recommendations** that understand campaign goals

Ready to experience the future of influencer marketing with a unified, AI-enhanced interface! 🚀

---

**Need help?** The platform includes comprehensive fallback features, so even without the LLM integration, you'll have access to all the core functionality. 