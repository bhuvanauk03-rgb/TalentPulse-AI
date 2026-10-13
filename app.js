
const API_URL =
  "https://xhrw4xpw61.execute-api.ap-south-1.amazonaws.com/candidates";

const COGNITO_URL =
  "https://ap-south-1jxvmptg5m.auth.ap-south-1.amazoncognito.com/oauth2/authorize?client_id=16h7nk3soiq43cv8fat01t473a&response_type=code&scope=openid%20email&redirect_uri=http%3A%2F%2F127.0.0.1%3A5500%2Ffrontend%2Findex.html";

const REQUIRED = [
  "AWS",
  "Cloud Computing",
  "Python",
  "Java",
  "SQL",
  "Docker",
  "Git",
  "Machine Learning"
];

const MAX_FILES_PER_BATCH = 10;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("signInBtn").onclick = () => {
    location.href = COGNITO_URL;
  };

  document.getElementById("refreshBtn").onclick = loadCandidates;
  document.getElementById("refreshCandidates").onclick = loadCandidates;

  document.getElementById("resumeFile").addEventListener("change", handleResume);

  setupNav();
  loadCandidates();
});

function setupNav() {
  document.querySelectorAll(".nav-item").forEach(a => {
    a.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(x => {
        x.classList.remove("active");
      });
      a.classList.add("active");
    });
  });
}

async function loadCandidates() {
  const table = document.getElementById("candidateTable");
  table.innerHTML =
    '<tr><td colspan="6" class="empty">Loading candidates from AWS...</td></tr>';

  try {
    const res = await fetch(API_URL);

    if (!res.ok) {
      throw new Error("API returned " + res.status);
    }

    const raw = await res.json();
    const candidates = Array.isArray(raw)
      ? raw
      : (raw.candidates || []);

    candidates.sort(
      (a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0)
    );

    renderCandidates(candidates);
    renderStats(candidates);
    renderSkills(candidates);
    renderPipeline(candidates);

    addAudit(`AWS candidate data refreshed · ${candidates.length} records`);
  } catch (err) {
    console.error(err);
    table.innerHTML =
      '<tr><td colspan="6" class="empty">Unable to load AWS candidates. Check API Gateway.</td></tr>';
    addAudit("Candidate API connection failed");
  }
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function renderCandidates(candidates) {
  const table = document.getElementById("candidateTable");

  if (!candidates.length) {
    table.innerHTML =
      '<tr><td colspan="6" class="empty">No candidates found.</td></tr>';
    return;
  }

  table.innerHTML = candidates.map((c, i) => {
    const score = Number(c.matchScore || 0);
    const cls = c.classification || classification(score);
    const skills = normalizeSkills(c.matchedSkills || c.skills).slice(0, 4)
      .map(s => `<span class="skill-chip">${escapeHtml(s)}</span>`)
      .join("");

    return `
      <tr>
        <td>#${i + 1}</td>
        <td>
          <span class="candidate-name">${escapeHtml(c.candidateName || "Candidate")}</span>
          <br><small>${escapeHtml(c.email || "")}</small>
        </td>
        <td>${skills || "—"}</td>
        <td class="score">${score}%</td>
        <td><span class="badge ${badgeClass(cls)}">${escapeHtml(cls)}</span></td>
        <td>
          <span class="badge ${
            c.status === "AI_PROCESSED" ? "excellent" : "moderate"
          }">${escapeHtml(c.status || "RECEIVED")}</span>
        </td>
      </tr>
    `;
  }).join("");
}

function renderStats(candidates) {
  document.getElementById("statCandidates").textContent = candidates.length;

  document.getElementById("statProcessed").textContent =
    candidates.filter(c => c.status === "AI_PROCESSED").length;

  document.getElementById("statStrong").textContent =
    candidates.filter(c => Number(c.matchScore || 0) >= 80).length;

  document.getElementById("statTop").textContent =
    candidates.length
      ? Math.max(...candidates.map(c => Number(c.matchScore || 0))) + "%"
      : "0%";
}

function renderSkills(candidates) {
  const box = document.getElementById("skillMatrix");

  box.innerHTML = REQUIRED.map(skill => {
    let count = 0;

    candidates.forEach(c => {
      const skills = normalizeSkills(c.matchedSkills || c.skills);
      const text = skills.join(" ").toLowerCase();

      if (text.includes(skill.toLowerCase())) count++;
    });

    const pct = candidates.length
      ? Math.round((count / candidates.length) * 100)
      : 0;

    return `
      <div class="skill-row">
        <span>${escapeHtml(skill)}</span>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <b>${pct}%</b>
      </div>
    `;
  }).join("");
}

function renderPipeline(candidates) {
  const counts = {
    Excellent: 0,
    Strong: 0,
    Good: 0,
    Moderate: 0,
    Low: 0
  };

  candidates.forEach(c => {
    const score = Number(c.matchScore || 0);

    if (score >= 90) counts.Excellent++;
    else if (score >= 80) counts.Strong++;
    else if (score >= 70) counts.Good++;
    else if (score >= 60) counts.Moderate++;
    else counts.Low++;
  });

  document.getElementById("pipelineStats").innerHTML =
    Object.entries(counts).map(([name, count]) => `
      <div class="pipeline-row">
        <span>${name} Match</span>
        <b>${count}</b>
      </div>
    `).join("");
}

// BULK UPLOAD: process each PDF one at a time.
async function handleResume(event) {
  const files = Array.from(event.target.files || []);
  const status = document.getElementById("uploadStatus");
  const resultCard = document.getElementById("resultCard");

  if (!files.length) return;

  const pdfFiles = files.filter(file =>
    file.name.toLowerCase().endsWith(".pdf") ||
    file.type === "application/pdf"
  );

  if (pdfFiles.length !== files.length) {
    status.textContent =
      "Please select PDF files only. Remove any non-PDF files and try again.";
    event.target.value = "";
    return;
  }

  if (pdfFiles.length > MAX_FILES_PER_BATCH) {
    status.textContent =
      `Please select no more than ${MAX_FILES_PER_BATCH} PDFs per batch. ` +
      "Upload the remaining files in another batch.";
    event.target.value = "";
    return;
  }

  let pdfjs;

  let succeeded = 0;
  const failures = [];

  resultCard.classList.add("hidden");

  try {
    status.textContent = "Loading the PDF extraction engine...";

    pdfjs = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs"
    );

    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  } catch (err) {
    console.error(err);
    status.textContent =
      "Could not load the PDF reader. Check your internet connection and try again.";
    event.target.value = "";
    return;
  }

  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];

    status.textContent =
      `Processing ${i + 1} of ${pdfFiles.length}: ${file.name}`;

    try {
      await processOneResume(file, pdfjs);
      succeeded++;
    } catch (err) {
      console.error(`Failed to process ${file.name}:`, err);
      failures.push(`${file.name}: ${err.message || "Processing failed"}`);
      addAudit(`Resume failed · ${file.name}`);
    }
  }

  await loadCandidates();

  if (failures.length === 0) {
    status.textContent =
      `✓ Batch complete: ${succeeded} of ${pdfFiles.length} resumes processed successfully.`;
  } else {
    status.textContent =
      `Batch complete: ${succeeded} succeeded, ${failures.length} failed. ` +
      "See the browser console for error details.";
    console.error("Bulk upload failures:", failures);
  }

  event.target.value = "";
}

async function processOneResume(file, pdfjs) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;

  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    pages.push(content.items.map(item => item.str || "").join(" "));
  }

  const resumeText = pages.join("\n").trim();

  if (!resumeText) {
    throw new Error("No selectable text found. This may be a scanned PDF.");
  }

  const lines = resumeText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const emailMatch = resumeText.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );

  const candidateName =
    lines[0] || file.name.replace(/\.pdf$/i, "");

  const email = emailMatch
    ? emailMatch[0]
    : `no-email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@talentpulse.invalid`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      candidateName,
      email,
      resumeText,
      fileName: file.name
    })
  });

  const raw = await response.json();

  if (!response.ok) {
    const message =
      typeof raw.body === "string"
        ? raw.body
        : raw.message || "API request failed";

    throw new Error(message);
  }

  const result =
    typeof raw.body === "string"
      ? JSON.parse(raw.body)
      : (raw.body || raw);

  showResumeResult(result, candidateName);
  addAudit(
    `Resume analyzed · ${result.candidateName || candidateName} · ${result.matchScore ?? 0}%`
  );
}

function showResumeResult(result, fallbackName) {
  document.getElementById("resultName").textContent =
    result.candidateName || fallbackName;

  document.getElementById("resultScore").textContent =
    (result.matchScore ?? 0) + "%";

  document.getElementById("resultClass").textContent =
    result.classification || classification(Number(result.matchScore || 0));

  document.getElementById("resultStatus").textContent =
    result.status || "AI_PROCESSED";

  document.getElementById("matchedSkills").innerHTML =
    normalizeSkills(result.matchedSkills)
      .map(skill =>
        `<span class="skill-chip">✓ ${escapeHtml(skill)}</span>`
      ).join("") || "None";

  document.getElementById("missingSkills").innerHTML =
    normalizeSkills(result.missingSkills)
      .map(skill =>
        `<span class="missing-chip">✗ ${escapeHtml(skill)}</span>`
      ).join("") || "None";

  document.getElementById("resultCard").classList.remove("hidden");
}

function classification(score) {
  if (score >= 90) return "Excellent Match";
  if (score >= 80) return "Strong Match";
  if (score >= 70) return "Good Match";
  if (score >= 60) return "Moderate Match";
  return "Low Match";
}

function badgeClass(value) {
  if (value.includes("Excellent")) return "excellent";
  if (value.includes("Strong")) return "strong";
  if (value.includes("Good")) return "good";
  if (value.includes("Moderate")) return "moderate";
  return "low";
}

function addAudit(message) {
  const box = document.getElementById("auditLog");
  const entry = document.createElement("div");

  entry.textContent = new Date().toLocaleTimeString() + " · " + message;
  box.prepend(entry);

  while (box.children.length > 5) {
    box.lastChild.remove();
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}
