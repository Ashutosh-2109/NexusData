import os
import json
import logging
import requests
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

logger = logging.getLogger("gemini_insights")

# Simple in-memory cache for deterministic caching
# Key: dataset_a_variable_a_dataset_b_variable_b_stats -> Value: insight dict
RELATIONSHIP_INSIGHTS_CACHE: Dict[str, Dict[str, Any]] = {}
GRAPH_SUMMARY_CACHE: Dict[str, Dict[str, Any]] = {}

SYSTEM_INSTRUCTION = """
You are an analytical assistant for an urban multi-domain data analytics platform.
Your job is to interpret statistical relationships calculated by a deterministic analytics engine.
Do not calculate or modify statistical values.
Do not claim causation from correlation.
Use language such as:
- associated with
- correlated with
- tends to coincide with
- relationship observed in the data
Avoid:
- causes
- leads to
- proves
- definitely results in
Identify possible explanations only as hypotheses.
Base the explanation strictly on the provided statistical evidence.
Never invent figures or omit stated limitations. Recommendations are candidate checks, not policy guidance.
Mention uncertainty when appropriate.
Return structured JSON only matching the requested schema.
"""

def get_gemini_api_key() -> Optional[str]:
    """Retrieve Gemini API Key from environment."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    return key if key else None

def make_cache_key(rel: Dict[str, Any]) -> str:
    """Generate a deterministic cache key for a relationship pair."""
    d_a = str(rel.get("dataset_a", ""))
    v_a = str(rel.get("variable_a", ""))
    d_b = str(rel.get("dataset_b", ""))
    v_b = str(rel.get("variable_b", ""))
    p = str(rel.get("pearson", ""))
    s = str(rel.get("spearman", ""))
    m = str(rel.get("mutual_information", ""))
    return f"{d_a}_{v_a}_{d_b}_{v_b}_{p}_{s}_{m}"

def call_gemini_api(prompt: str, system_prompt: str = SYSTEM_INSTRUCTION, model: str = "gemini-2.0-flash") -> Dict[str, Any]:
    """
    Calls the Google Gemini API with JSON response format.
    Never exposes API key in logs or error traces.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in the environment or backend/.env file.")

    # We can try gemini-2.0-flash, and fall back to gemini-1.5-flash if needed
    models_to_try = [model, "gemini-1.5-flash", "gemini-1.5-pro"]
    last_error = None

    for m in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}]
                }
            ],
            "systemInstruction": {
                "role": "system",
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2
            }
        }

        try:
            response = requests.post(
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=20
            )

            if response.status_code == 200:
                data = response.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    raise ValueError("Gemini returned no candidates.")
                
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts:
                    raise ValueError("Gemini returned empty parts.")
                
                raw_text = parts[0].get("text", "").strip()
                # Clean possible markdown wrapping
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.startswith("```"):
                    raw_text = raw_text[3:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                raw_text = raw_text.strip()

                return json.loads(raw_text)

            elif response.status_code in [400, 403, 404]:
                err_data = response.json().get("error", {})
                err_msg = err_data.get("message", f"HTTP {response.status_code}")
                # If model not found, try fallback
                if "not found" in err_msg.lower() or response.status_code == 404:
                    last_error = err_msg
                    continue
                raise ValueError(f"Gemini API error ({response.status_code}): {err_msg}")
            elif response.status_code == 429:
                raise ValueError("Gemini API rate limit exceeded. Please try again shortly.")
            else:
                raise ValueError(f"Gemini API returned status code {response.status_code}")

        except requests.exceptions.Timeout:
            raise ValueError("Gemini API request timed out after 20 seconds.")
        except json.JSONDecodeError as jde:
            raise ValueError(f"Failed to parse Gemini response as valid JSON: {str(jde)}")
        except Exception as e:
            last_error = str(e)
            if "not set" in str(e):
                raise
            continue

    raise ValueError(f"Failed to generate insight: {last_error or 'Unknown error'}")

def generate_relationship_insight(
    relationship: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generates structured AI interpretation for a single pairwise statistical relationship.
    Grounded strictly on the provided evidence.
    """
    if not relationship:
        raise ValueError("Relationship data is empty.")

    cache_key = make_cache_key(relationship)
    if cache_key in RELATIONSHIP_INSIGHTS_CACHE:
        return RELATIONSHIP_INSIGHTS_CACHE[cache_key]

    v_a = relationship.get("variable_a", "Variable A")
    d_a = relationship.get("dataset_a", "Dataset A")
    v_b = relationship.get("variable_b", "Variable B")
    d_b = relationship.get("dataset_b", "Dataset B")
    pearson = relationship.get("pearson")
    spearman = relationship.get("spearman")
    mi = relationship.get("mutual_information")
    samples = relationship.get("sample_count", 0)
    missing = relationship.get("missing_percentage", 0.0)
    strength = relationship.get("relationship_strength", "Indeterminate")
    is_cross = relationship.get("is_cross_dataset", True)

    ctx_info = context or {}
    time_range = ctx_info.get("time_range", "Aligned dataset period")
    locations = ctx_info.get("locations", [])
    aggregation = ctx_info.get("aggregation", "1 hour mean")

    prompt = f"""
Analyze and interpret the following empirical statistical relationship discovered by the data engine:

EVIDENCE:
- Variable A: "{v_a}" from dataset "{d_a}"
- Variable B: "{v_b}" from dataset "{d_b}"
- Cross-Domain: {is_cross}
- Pearson Linear Correlation: {pearson}
- Spearman Rank Correlation: {spearman}
- Mutual Information: {mi}
- Overlapping Sample Count: {samples:,} observations
- Missing/Null Percentage: {missing}%
- Pre-classified Strength: {strength}
- Data Context: Time horizon is {time_range}, aggregation frequency is {aggregation}, spatial entities: {locations if locations else 'Combined'}

INSTRUCTIONS:
Return a JSON object with EXACTLY these keys:
- "title": Concise 1-sentence title describing the relationship.
- "summary": 1-2 sentence executive summary of what was observed.
- "interpretation": Clear, human-readable analytical interpretation. Grounded strictly in the provided statistical values. Do NOT invent causality.
- "possible_factors": An array of 3-4 domain hypotheses or co-factors that might explain why these variables tend to coincide.
- "caution": A statement highlighting that correlation is not causation and noting potential confounding variables.
- "recommended_checks": An array of 3-4 concrete analytical follow-up steps (e.g. time-lag testing, sub-segmentation by location or time-of-day, weather conditioning).
"""

    insight_json = call_gemini_api(prompt)

    # Validate output schema
    required_keys = ["title", "summary", "interpretation", "possible_factors", "caution", "recommended_checks"]
    for k in required_keys:
        if k not in insight_json:
            if isinstance(insight_json.get(k), list):
                insight_json[k] = []
            else:
                insight_json[k] = ""

    # Ensure lists are lists
    if not isinstance(insight_json.get("possible_factors"), list):
        insight_json["possible_factors"] = [str(insight_json.get("possible_factors", ""))]
    if not isinstance(insight_json.get("recommended_checks"), list):
        insight_json["recommended_checks"] = [str(insight_json.get("recommended_checks", ""))]

    # Cache successful response
    RELATIONSHIP_INSIGHTS_CACHE[cache_key] = insight_json
    return insight_json

def generate_graph_summary(
    top_relationships: List[Dict[str, Any]],
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generates a macro-level overview of the entire Insight Graph based on top relationships.
    """
    if not top_relationships:
        raise ValueError("No relationships provided to summarize.")

    # Create deterministic cache key from top relationships
    cache_key = "_".join([make_cache_key(r) for r in top_relationships[:10]])
    if cache_key in GRAPH_SUMMARY_CACHE:
        return GRAPH_SUMMARY_CACHE[cache_key]

    ctx_info = context or {}
    time_range = ctx_info.get("time_range", "Harmonized dataset")
    total_records = ctx_info.get("total_records", 0)

    # Grounded evidence summaries
    evidence_lines = []
    for r in top_relationships[:12]:
        evidence_lines.append(
            f"- {r.get('variable_a')} ({r.get('dataset_a')}) ↔ {r.get('variable_b')} ({r.get('dataset_b')}): "
            f"Pearson={r.get('pearson')}, Spearman={r.get('spearman')}, MI={r.get('mutual_information')}, "
            f"Samples={r.get('sample_count')}, Strength={r.get('relationship_strength')}"
        )
    evidence_text = "\n".join(evidence_lines)

    prompt = f"""
Review the top statistical relationships discovered across multiple urban/environmental domains:

DATASET CONTEXT:
- Total Harmonized Records: {total_records:,}
- Time Range: {time_range}

TOP STATISTICAL RELATIONSHIPS:
{evidence_text}

INSTRUCTIONS:
Return a JSON object with EXACTLY these keys:
- "overview": High-level 2-3 sentence executive summary characterizing the multi-domain system and overall degree of coupling observed in the data.
- "key_relationships": Array of objects, each containing:
    - "relationship": The variable pair name (e.g. "Temperature ↔ Grid Load")
    - "interpretation": Concise interpretation of how they move together in the data.
- "patterns": Array of 2-4 cross-domain themes or macro patterns observed (e.g. weather-demand coupling, emission-quality linkages).
- "next_analysis": Array of 3-4 recommended investigative priorities for data scientists.

CRITICAL: Do not claim causality. Rely only on the evidence provided above.
"""

    summary_json = call_gemini_api(prompt)

    # Schema validation
    if "overview" not in summary_json:
        summary_json["overview"] = "Multi-domain correlation overview."
    if "key_relationships" not in summary_json or not isinstance(summary_json["key_relationships"], list):
        summary_json["key_relationships"] = []
    if "patterns" not in summary_json or not isinstance(summary_json["patterns"], list):
        summary_json["patterns"] = []
    if "next_analysis" not in summary_json or not isinstance(summary_json["next_analysis"], list):
        summary_json["next_analysis"] = []

    GRAPH_SUMMARY_CACHE[cache_key] = summary_json
    return summary_json
