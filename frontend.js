let seed = null;
let candidates = [];
let currentView = "list";
let selectedPaper = null;

// Chat functionality
let chatOpen = false;
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const chatToggle = document.getElementById("chatToggle");
const chatWidget = document.getElementById("chatWidget");
const chatClose = document.getElementById("chatClose");

// Auto-resize textarea
chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    
    // Enable/disable send button
    chatSend.disabled = !this.value.trim();
});

// Toggle chat
chatToggle.addEventListener('click', () => {
    chatOpen = !chatOpen;
    if (chatOpen) {
    chatWidget.classList.add('open');
    chatToggle.innerHTML = '×';
    chatInput.focus();
    } else {
    chatWidget.classList.remove('open');
    chatToggle.innerHTML = '💬';
    }
});

// Close chat
chatClose.addEventListener('click', () => {
    chatOpen = false;
    chatWidget.classList.remove('open');
    chatToggle.innerHTML = '💬';
});

// Send message
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message
    addMessage(message, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatSend.disabled = true;

    // Show typing indicator
    const typingId = showTyping();

    // Generate contextual response
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
    });
    const data = await response.json();
    let responseText = data.reply;
    removeTyping(typingId);
    addMessage(responseText, 'bot');
}

function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
    const typingDiv = document.createElement('div');
    const typingId = Date.now();
    typingDiv.id = `typing-${typingId}`;
    typingDiv.className = 'message typing';
    typingDiv.innerHTML = `
    <span>Assistant is typing</span>
    <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    </div>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return typingId;
}

function removeTyping(typingId) {
    const typingDiv = document.getElementById(`typing-${typingId}`);
    if (typingDiv) {
    typingDiv.remove();
    }
}


// Event listeners
chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
    }
});

// Original paper search functionality
function renderList() {
    document.getElementById("cy").style.display = "none";
    document.getElementById("results").style.display = "flex";
    const listDiv = document.getElementById("list");
    
    if (candidates.length === 0) {
    listDiv.innerHTML = `
        <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
        </svg>
        <p>No papers found. Try a different search term.</p>
        </div>
    `;
    return;
    }
    
    listDiv.innerHTML = "";
    
    // Add seed paper first if it exists
    if (seed) {
    const div = createPaperElement(seed, true);
    listDiv.appendChild(div);
    }
    
    candidates.forEach((p, idx) => {
    const div = createPaperElement(p, false, idx);
    listDiv.appendChild(div);
    });
}

function createPaperElement(paper, isSeed = false, idx = null) {
    const div = document.createElement("div");
    div.className = "paper";
    if (selectedPaper === paper) {
    div.classList.add("selected");
    }
    
    const title = document.createElement("div");
    title.className = "paper-title";
    title.textContent = paper.title;
    
    const meta = document.createElement("div");
    meta.className = "paper-meta";
    
    const year = document.createElement("span");
    year.className = "paper-year";
    year.textContent = paper.year || "N/A";
    
    const citations = document.createElement("span");
    citations.textContent = `${paper.citations || 0} citations`;
    
    meta.appendChild(year);
    meta.appendChild(citations);
    
    div.appendChild(title);
    div.appendChild(meta);
    
    div.onclick = () => {
    // Remove selected class from all papers
    document.querySelectorAll(".paper").forEach(p => p.classList.remove("selected"));
    div.classList.add("selected");
    selectedPaper = paper;
    showAbstract(paper);
    };
    
    return div;
}

function showAbstract(paper) {
    const absDiv = document.getElementById("abstract");
    const content = `
    <div class="abstract-content">
        <h1 class="abstract-title">${paper.title}</h1>
        <div class="abstract-meta">
        <div class="meta-item">
            <div class="meta-label">Authors</div>
            <div class="meta-value">${paper.authors || "N/A"}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Year</div>
            <div class="meta-value">${paper.year || "N/A"}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Citations</div>
            <div class="meta-value">${paper.citations || 0}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">DOI</div>
            <div class="meta-value">${paper.doi || "N/A"}</div>
        </div>
        </div>
        <div class="abstract-text">${paper.abstract || "No abstract available."}</div>
    </div>
    `;
    absDiv.innerHTML = content;
}

function renderGraph() {
    document.getElementById("results").style.display = "none";
    document.getElementById("cy").style.display = "block";

    const tokenize = txt => new Set(txt.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
    const jaccard = (a, b) => {
    const A = tokenize(a), B = tokenize(b);
    if (!A.size || !B.size) return 0;
    let inter = 0; 
    for (const t of A) if (B.has(t)) inter++;
    return inter / new Set([...A, ...B]).size;
    };

    const elements = [
    { data: { id: "seed", label: seed.title.length > 50 ? seed.title.substring(0, 50) + "..." : seed.title } },
    ...candidates.map((c, i) => ({ 
        data: { 
        id: `c${i}`, 
        label: c.title.length > 50 ? c.title.substring(0, 50) + "..." : c.title 
        } 
    })),
    ...candidates.map((_, i) => ({ data: { source: "seed", target: `c${i}` } })),
    ];

    const threshold = 0.15;
    for (let i = 0; i < candidates.length; i++) {
    const ciText = `${candidates[i].title} ${candidates[i].abstract}`;
    for (let j = i + 1; j < candidates.length; j++) {
        const cjText = `${candidates[j].title} ${candidates[j].abstract}`;
        if (jaccard(ciText, cjText) >= threshold) {
        elements.push({ data: { source: `c${i}`, target: `c${j}` } });
        }
    }
    }

    const cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    style: [
        {
        selector: "node",
        style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 12,
            "font-weight": "600",
            "background-color": "#3b82f6",
            "color": "#ffffff",
            "border-width": 2,
            "border-color": "#1e40af",
            "text-wrap": "wrap",
            "text-max-width": "120px",
            "width": 60,
            "height": 60
        }
        },
        {
        selector: "node#seed",
        style: {
            "background-color": "#10b981",
            "border-color": "#059669",
            "width": 80,
            "height": 80,
            "font-size": 14
        }
        },
        {
        selector: "edge",
        style: {
            "width": 2,
            "line-color": "#404040",
            "curve-style": "bezier"
        }
        },
        {
        selector: "node:selected",
        style: {
            "border-width": 4,
            "border-color": "#fbbf24"
        }
        }
    ],
    layout: {
        name: "cose",
        animate: true,
        animationDuration: 1000,
        nodeOverlap: 10,
        nodeRepulsion: 8000
    }
    });

    cy.on("tap", "node", evt => {
    const id = evt.target.id();
    if (id === "seed") {
        showAbstract(seed);
        selectedPaper = seed;
    } else {
        const idx = parseInt(id.slice(1));
        showAbstract(candidates[idx]);
        selectedPaper = candidates[idx];
    }
    });
}

document.getElementById("searchBtn").onclick = async () => {
    const q = document.getElementById("query").value.trim();
    if (!q) return;
    
    // Show loading state
    const searchBtn = document.getElementById("searchBtn");
    const originalText = searchBtn.innerHTML;
    searchBtn.innerHTML = '<div class="spinner"></div><span>Searching...</span>';
    searchBtn.disabled = true;
    
    try {
    const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await resp.json();
    seed = data.seed;
    candidates = data.candidates;
    selectedPaper = null;
    
    renderList();
    if (seed) {
        showAbstract(seed);
        selectedPaper = seed;
    }
    } catch (error) {
    console.error("Search failed:", error);
    document.getElementById("list").innerHTML = `
        <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2L13.09,8.26L22,9L13.09,9.74L12,16L10.91,9.74L2,9L10.91,8.26L12,2Z" />
        </svg>
        <p>Search failed. Please try again.</p>
        </div>
    `;
    } finally {
    searchBtn.innerHTML = originalText;
    searchBtn.disabled = false;
    }
};

document.getElementById("toggleView").onclick = () => {
    if (!seed) return;
    
    const toggleBtn = document.getElementById("toggleView");
    currentView = currentView === "list" ? "graph" : "list";
    
    if (currentView === "graph") {
    toggleBtn.textContent = "📋 Toggle List";
    renderGraph();
    } else {
    toggleBtn.textContent = "📊 Toggle Graph";
    renderList();
    }
};

// Handle Enter key in search input
document.getElementById("query").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
    document.getElementById("searchBtn").click();
    }
});

// Demo data for testing (remove in production)
function loadDemoData() {
    seed = {
    title: "Attention Is All You Need",
    authors: "Vaswani, A., Shazeer, N., Parmar, N., et al.",
    year: "2017",
    citations: "45231",
    doi: "10.48550/arXiv.1706.03762",
    abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely."
    };
    
    candidates = [
    {
        title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
        authors: "Devlin, J., Chang, M. W., Lee, K., Toutanova, K.",
        year: "2018",
        citations: "38492",
        doi: "10.18653/v1/N19-1423",
        abstract: "We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers. Unlike recent language representation models, BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers."
    },
    {
        title: "GPT-3: Language Models are Few-Shot Learners",
        authors: "Brown, T., Mann, B., Ryder, N., et al.",
        year: "2020",
        citations: "15234",
        doi: "10.48550/arXiv.2005.14165",
        abstract: "Recent work has demonstrated substantial gains on many NLP tasks and benchmarks by pre-training on a large corpus of text followed by fine-tuning on a specific task. While typically task-agnostic in architecture, this method still requires task-specific fine-tuning datasets of thousands or tens of thousands of examples."
    }
    ];
    
    renderList();
    showAbstract(seed);
    selectedPaper = seed;
}
