/*
  AI ANALYSIS MODULE v2 - Industry-Specific African Market Screening
  Requires ANTHROPIC_API_KEY environment variable.
*/
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const enabled = !!ANTHROPIC_API_KEY;
console.log(`[AI] Module v2 loaded. Enabled: ${enabled}`);

const INDUSTRY_CONTEXT = {
  "FinTech": {
    criteria: "FINTECH EVALUATION: Regulatory status with FSCA/SARB? Sandbox participation? Unit economics and default rates if lending? Building on existing rails (M-Pesa, Ozow, Stitch) or own? B-BBEE Level 1-4 required for financial services. Competition: Yoco, TymeBank, Discovery Bank, Jumo, Peach Payments. Cross-border regulatory complexity (CBK Kenya, CBN Nigeria, SARB SA).",
    comps: "African FinTech: Flutterwave, Chipper Cash, TymeBank, Jumo, M-Pesa, Yoco, Stitch, Ozow, MFS Africa."
  },
  "HealthTech": {
    criteria: "HEALTHTECH EVALUATION: Clinical validation evidence? SAHPRA approval needed? Targeting public (80% population) or private healthcare? NHI rollout positioning? POPIA health data compliance? Integration with paper-based clinic systems? SA healthcare worker shortage - solutions reducing workload score higher.",
    comps: "African HealthTech: hearX Group, mPharma, Helium Health, Zuri Health, Babylon Health Africa."
  },
  "CleanTech": {
    criteria: "CLEANTECH EVALUATION: Load shedding creates immediate demand for energy solutions. Grid-connected vs off-grid? Carbon credit revenue potential? REIPPP programme alignment? SA mineral resources for battery/storage. Water scarcity solutions. Just Energy Transition ($8.5B international funding for coal transition).",
    comps: "African CleanTech: Arnergy, Sun King, M-KOPA, PowerGen, Daystar Power, SolarAfrica, Revego."
  },
  "EdTech": {
    criteria: "EDTECH EVALUATION: SETA grant access changes unit economics entirely. B-BBEE skills development scoring for corporate clients. Digital divide - 40%+ lack reliable internet, offline-capable scores higher. NSFAS market (1M+ funded students). 55% youth unemployment - education-to-employment pipeline most valuable. 11 official languages. WeThinkCode/ALX model precedent.",
    comps: "African EdTech: GetSmarter (acquired by 2U), WeThinkCode, Moringa School, Andela, uLesson, SPARK Schools."
  },
  "Logistics & Supply Chain": {
    criteria: "LOGISTICS EVALUATION: Infrastructure constraints (road quality, Durban port congestion, border delays). Township last-mile challenges (informal addressing, security). AfCFTA cross-border opportunities. Cold chain underdevelopment. Informal sector bridging. SA e-commerce growing 30%+ annually.",
    comps: "African logistics: Lori Systems, Kobo360, Sendy, uAfrica, Pargo, The Courier Guy."
  },
  "SaaS": {
    criteria: "SAAS EVALUATION: ZAR vs USD pricing? SA has 2.6M SMEs mostly micro-enterprises with limited budgets. Enterprise sales cycles 6-12 months. POPIA local hosting requirements. Integration with Sage, Xero, Pastel, SAP. High SME failure rate impacts churn.",
    comps: "African SaaS: Paystack, SweepSouth, OfferZen, Platform45, DataProphet."
  },
  "AI & Machine Learning": {
    criteria: "AI EVALUATION: Proprietary African datasets (scarce and valuable)? Fine-tuning global models vs building from scratch? African language support (underserved by LLMs). Compute cost management. Genuine ML expertise vs API wrappers. Ethical AI considerations (bias in facial recognition, credit scoring fairness in African context).",
    comps: "African AI: Lelapa AI, InstaDeep (acquired by BioNTech), Aerobotics, DataProphet."
  },
  "AgriTech": {
    criteria: "AGRITECH EVALUATION: Smallholder vs commercial farming (completely different markets). Water management tech in water-scarce SA. Farm-to-market logistics and cold chain. Input financing models. Climate resilience solutions. Land reform uncertainty and opportunity.",
    comps: "African AgriTech: Aerobotics, Khula, Apollo Agriculture, Twiga Foods, Agrikore."
  },
  "CyberSecurity": {
    criteria: "CYBERSECURITY EVALUATION: POPIA enforcement driving compliance demand. Financial sector requirements (SARB directives). Severe skills shortage - automation scores higher. Government market opportunity. SME market (zero cybersecurity) has massive scale potential.",
    comps: "African cybersecurity: Snode Technologies, Sendmarc, ESET Africa."
  }
};

const SA_CONTEXT = `AFRICAN MARKET CONTEXT: SA GDP ~$400B, largest African economy. 62M population, median age 28. 90%+ smartphone penetration. Load shedding affects all businesses. ZAR ~R18-19/USD with volatility risk. Key regulations: POPIA, FICA, B-BBEE, NCA. VC ecosystem $500M-$1B annually. Pre-seed R1-5M, Seed R5-20M, Series A R20-80M. Key investors: Knife Capital, Naspers/Prosus, HAVAIC, Kalon, Partech Africa. Limited JSE exits, mostly trade sales. Township economy is 60%+ of consumer spending. Pan-African expansion typically SA->Kenya->Nigeria.`;

function buildSystemPrompt(industry) {
  const ctx = INDUSTRY_CONTEXT[industry] || { criteria: "Evaluate market size in Africa, regulatory hurdles, B-BBEE compliance, currency risk, talent availability, and infrastructure dependencies.", comps: "Include African and emerging market comparables." };
  return `You are a senior VC analyst specialising in African startups with 15 years experience. You evaluate for a curated board of South Africa's most successful business leaders.

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "summary": "2-3 sentences contextualised to African market",
  "readiness_score": 7.5,
  "strengths": [{"title": "Title", "detail": "1-2 sentences with African market context"}],
  "red_flags": [{"title": "Title", "detail": "1-2 sentences with SA/African risk context"}],
  "market_size": "Africa/SA specific TAM and SAM with data points, not global numbers",
  "comparables": [{"name": "Company (region)", "context": "Relevance and outcome if known"}],
  "suggested_questions": ["Specific probing question referencing claims in submission"],
  "sector_insight": "One paragraph showing deep sector knowledge in African context"
}

SCORING (calibrated to African startups):
1-3: Idea, no validation | 4-5: Early validation, pre-revenue | 5-6: MVP, early traction | 6-7: Product-market fit signals | 7-8: Strong traction, proven unit economics | 8-9: Exceptional, regulatory approvals, term sheets | 9-10: Almost never given

Rules: strengths 3-5 (at least one African-specific advantage). red_flags 2-4 (always at least 2, reference African risks). comparables 2-4 from: ${ctx.comps} suggested_questions 4-6 (specific, not generic).

${SA_CONTEXT}

${ctx.criteria}`;
}

async function analyzeSubmission(submission) {
  if (!enabled) { console.log("[AI] Skipped: No API key"); return null; }
  const userPrompt = `Analyze this startup:
Company: ${submission.company_name}
One-liner: ${submission.one_liner}
Industry: ${submission.industry}
Stage: ${submission.stage}
Team Size: ${submission.team_size || "Not specified"}
Website: ${submission.website || "Not provided"}
Funding Target: ${submission.funding_target || "Not specified"}

PROBLEM: ${submission.problem}
SOLUTION: ${submission.solution}
TRACTION: ${submission.traction}
LOOKING FOR: ${submission.looking_for || "Not specified"}
ADDITIONAL NOTES: ${submission.additional_notes || "None"}`;

  try {
    console.log(`[AI] Analyzing: ${submission.company_name} (${submission.industry})`);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, system: buildSystemPrompt(submission.industry), messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!response.ok) { const err = await response.text(); console.error(`[AI] API error ${response.status}: ${err}`); return null; }
    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) { console.error("[AI] No text"); return null; }
    const analysis = JSON.parse(text);
    if (!analysis.readiness_score || !analysis.summary) { console.error("[AI] Invalid structure"); return null; }
    console.log(`[AI] Score: ${analysis.readiness_score}/10 for ${submission.company_name}`);
    return text;
  } catch (error) { console.error("[AI] Error:", error.message); return null; }
}

module.exports = { analyzeSubmission, enabled };
