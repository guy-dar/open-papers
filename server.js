// server.js
// Run: npm install express
const express = require("express");
const app = express();

app.use(express.static(".")); // serve frontend files from current dir

const OPENALEX_BASE = "https://api.openalex.org/works";

// Utility: convert OpenAlex abstract_inverted_index to string
function abstractToString(absIdx) {
  if (!absIdx) return "";
  const arr = [];
  for (const [word, positions] of Object.entries(absIdx)) {
    positions.forEach(pos => arr[pos] = word);
  }
  return arr.join(" ");
}

// Scoring heuristic
function scorePaper(w) {
  const citations = Math.log10((w.cited_by_count || 0) + 1);
  const recencyBoost =
    w.publication_year >= new Date().getFullYear() - 1 ? 1.0 :
    w.publication_year >= new Date().getFullYear() - 2 ? 0.5 : 0.2;
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
    const mainResp = await fetch(`${OPENALEX_BASE}?search=${encodeURIComponent(query)}&per-page=1`);
    const mainData = await mainResp.json();

    if (!mainData.results || mainData.results.length === 0) {
      return res.json({ seed: null, candidates: [] });
    }

    const seed = mainData.results[0];
    const seedId = seed.id.split("/").pop(); // e.g., W123456789

    // 2. Get IDs of referenced works (in seed object) and citing works
    const refIds = (seed.referenced_works || []).map(id => id.split("/").pop());

    // Get citing works via API filter
    const citingResp = await fetch(`${OPENALEX_BASE}?filter=cites:${seedId}&per-page=15`);
    const citingData = await citingResp.json();
    const citingIds = (citingData.results || []).map(w => w.id.split("/").pop());

    // 3. Batch fetch metadata for referenced works (if any)
    let refs = [];
    if (refIds.length > 0) {
      const refsResp = await fetch(`${OPENALEX_BASE}?filter=openalex_id:${refIds.slice(0,15).join("|")}`);
      const refsData = await refsResp.json();
      refs = refsData.results || [];
    }

    // Citing works are already full objects
    let works = [...refs, ...(citingData.results || [])];

    // 4. Remove duplicates by ID
    const seen = new Set();
    works = works.filter(w => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });

    // 5. Filter for quality
    works = works.filter(w => {
      const hasAbstract = w.abstract_inverted_index && Object.keys(w.abstract_inverted_index).length > 0;
      const citationCount = w.cited_by_count || 0;
      return hasAbstract && citationCount >= 5;
    });

    // Keep recent or highly cited
    works = works.filter(w => {
      const year = w.publication_year || 0;
      const citationCount = w.cited_by_count || 0;
      return (year >= new Date().getFullYear() - 5) || citationCount >= 50;
    });

    // 6. Score and sort
    works.sort((a, b) => scorePaper(b) - scorePaper(a));
    works = works.slice(0, 40);

    // 7. Convert to clean objects
    const seedObj = {
      title: seed.title,
      authors: (seed.authorships || []).map(a => a.author.display_name).join(", "),
      year: seed.publication_year,
      abstract: abstractToString(seed.abstract_inverted_index),
      citations: seed.cited_by_count
    };

    const candidates = works.map(w => ({
      title: w.title,
      authors: (w.authorships || []).map(a => a.author.display_name).join(", "),
      year: w.publication_year,
      abstract: abstractToString(w.abstract_inverted_index),
      citations: w.cited_by_count
    }));

    res.json({ seed: seedObj, candidates });
  } catch (err) {
    console.error("Error in /api/search:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
