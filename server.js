const fs = require("fs");
const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const apiKey = fs.readFileSync("secrets/gemini_key.txt", "utf8").trim();
const ai = new GoogleGenAI({apiKey: apiKey});
const app = express();

app.use(express.json());
app.use(express.static(".")); // Serve frontend files

const SEMANTIC_SCHOLAR_BASE = "https://api.semanticscholar.org/graph/v1";

// Scoring heuristic
function scorePaper(w) {
  MAX_CITATION = 100
  const citations = Math.log10(Math.min((w.citationCount || 0) + 1, MAX_CITATION));
  const recencyBoost =
    w.year >= new Date().getFullYear() - 1 ? 1.0 :
    w.year >= new Date().getFullYear() - 2 ? 0.5 : 0.2;
  return 0.3 * citations + 0.2 * recencyBoost;
}

// API endpoint for paper search
app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required." });
    }

    // 1. Find the main paper
    const searchResp = await fetch(
      `${SEMANTIC_SCHOLAR_BASE}/paper/search?query=${encodeURIComponent(query)}&limit=1&fields=title,authors,year,abstract,citationCount,paperId`
    );
    const searchData = await searchResp.json();
    if (!searchData.data || searchData.data.length === 0) {
      return res.json({ seed: null, candidates: [] });
    }

    const seed = searchData.data[0];
    const seedId = seed.paperId;

    // 2. Get references (cited by seed) and citations (citing seed)
    const [refsResp, citingResp] = await Promise.all([
      fetch(`${SEMANTIC_SCHOLAR_BASE}/paper/${seedId}/references?fields=paperId,title,authors,year,abstract,citationCount`),
      fetch(`${SEMANTIC_SCHOLAR_BASE}/paper/${seedId}/citations?fields=paperId,title,authors,year,abstract,citationCount&limit=15`)
    ]);

    const refsData = await refsResp.json();
    const citingData = await citingResp.json();

    // Extract referenced papers (flatten and filter nulls)
    const refs = (refsData.data || [])
      .map(ref => ref.citedPaper)
      .filter(Boolean);

    // Citing papers are already in the response
    let works = [...refs, ...(citingData.data || [])];

    // 3. Remove duplicates by paperId
    const seen = new Set();
    works = works.filter(w => {
      if (!w.paperId || seen.has(w.paperId)) return false;
      seen.add(w.paperId);
      return true;
    });

    // 4. Filter for quality (abstract + citations)
    works = works.filter(w => {
      const hasAbstract = w.abstract && w.abstract.length > 0;
      const citationCount = w.citationCount || 0;
      return hasAbstract && citationCount >= 5;
    });

    // 5. Keep recent or highly cited
    works = works.filter(w => {
      const year = w.year || 0;
      const citationCount = w.citationCount || 0;
      return (year >= new Date().getFullYear() - 5) || citationCount >= 50;
    });

    // 6. Score and sort
    works.sort((a, b) => scorePaper(b) - scorePaper(a));
    works = works.slice(0, 40);

    // 7. Format response
    const seedObj = {
      title: seed.title,
      authors: (seed.authors || []).map(a => a.name).join(", "),
      year: seed.year,
      abstract: seed.abstract || "",
      citations: seed.citationCount
    };

    const candidates = works.map(w => ({
      title: w.title,
      authors: (w.authors || []).map(a => a.name).join(", "),
      year: w.year,
      abstract: w.abstract || "",
      citations: w.citationCount
    }));

    res.json({ seed: seedObj, candidates });
  } catch (err) {
    console.error("Error in /api/search:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Chat
async function generateResponse(message) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: message,
  });
  return response.text;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Missing 'message' in request body." });
    }

    const reply = await generateResponse(message);
    res.json({ reply });
  } catch (err) {
    console.error("Error in /api/chat:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});