
/* ==========================================
   TALENTPULSE AI — BULK RESUME SCREENING
   ========================================== */

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

const MAX_FILES_PER_BATCH = 100;

let processedThisSession = [];
let processingBatch = false;

document.addEventListener("DOMContentLoaded", () => {
  const signInBtn = document.getElementById("signInBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const refreshCandidates = document.getElementById("refreshCandidates");
  const resumeFile = document.getElementById("resumeFile");

  if (signInBtn) {
    signInBtn.addEventListener("click", () => {
      window.location.href = COGNITO_URL;
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadCandidates);
  }

  if (refreshCandidates) {
    refreshCandidates.addEventListener("click", loadCandidates);
  }

  if (resumeFile) {
    resumeFile.addEventListener("change", handleResume);
  }

  setupNav();
  loadCandidates();
});

/* NAVIGATION */

function setupNav() {
  document.querySelectorAll(".nav-item").forEach(link => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
      });

      link.classList.add("active");
    });
  });
}

/* API RESPONSE NORMALIZATION */

async function readApiResponse(response) {
  const rawText = await response.text();

  let raw = {};

  try {
    raw = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error("The API returned an invalid JSON response.");
  }

  if (!response.ok) {
    throw new Error(
      raw.message ||
      raw.error ||
      `API request failed with status ${response.status}`
    );
  }

  if (typeof raw.body === "string") {
    try {
      return JSON.parse(raw.body);
    } catch {
      throw new Error("The API returned an invalid response body.");
    }
  }

  if (raw.body && typeof raw.body === "object") {
    return raw.body;
  }

  return raw;
}

/* LOAD CANDIDATES */

async function loadCandidates() {
  const table = document.getElementById("candidateTable");

  if (table) {
    table.innerHTML =
      '<tr><td colspan="6" class="empty">Loading candidates from AWS...</td></tr>';
  }

  try {
    const response = await fetch(API_URL);
    const raw = await readApiResponse(response);

    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.candidates)
        ? raw.candidates
        : [];

    candidates.sort(
      (a, b) =>
        Number(b.matchScore || 0) - Number(a.matchScore || 0)
    );

    renderCandidates(candidates);
    renderStats(candidates);
    renderSkills(candidates);
    renderPipeline(candidates);

    addAudit(
      `AWS candidate data refreshed · ${candidates.length} records`
    );
  } catch (error) {
    console.error("Unable to load candidates:", error);

    if (table) {
      table.innerHTML =
        '<tr><td colspan="6" class="empty">Unable to load AWS candidates. Check the API URL, route, and CORS configuration.</td></tr>';
    }

    addAudit("Candidate API connection failed");
  }
}

/* NORMALIZE SKILLS */

function normalizeSkills(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

/* CLASSIFICATION */

function classification(score) {
  if (score >= 90) return "Excellent Match";
  if (score >= 80) return "Strong Match";
  if (score >= 70) return "Good Match";
  if (score >= 60) return "Moderate Match";
  return "Low Match";
}

function badgeClass(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("excellent")) return "excellent";
  if (text.includes("strong")) return "strong";
  if (text.includes("good")) return "good";
  if (text.includes("moderate")) return "moderate";

  return "low";
}

/* RENDER CANDIDATE TABLE */

function renderCandidates(candidates) {
  const table = document.getElementById("candidateTable");
  if (!table) return;

  if (!candidates.length) {
    table.innerHTML =
      '<tr><td colspan="6" class="empty">No candidates found. Upload PDF resumes to begin.</td></tr>';
    return;
  }

  table.innerHTML = candidates.map((candidate, index) => {
    const score = Number(candidate.matchScore || 0);

    const decision =
      candidate.classification || classification(score);

    const skills = normalizeSkills(
      candidate.matchedSkills ?? candidate.skills
    )
      .slice(0, 4)
      .map(skill =>
        `<span class="skill-chip">${escapeHtml(skill)}</span>`
      )
      .join("");

    const status = candidate.status || "RECEIVED";

    return `
      <tr>
        <td>#${index + 1}</td>

        <td>
          <span class="candidate-name">
            ${escapeHtml(candidate.candidateName || "Candidate")}
          </span>
          <br>
          <small>${escapeHtml(candidate.email || "")}</small>
        </td>

        <td>${skills || "—"}</td>

        <td class="score">${score}%</td>

        <td>
          <span class="badge ${badgeClass(decision)}">
            ${escapeHtml(decision)}
          </span>
        </td>

        <td>
          <span class="badge ${badgeClass(decision)}">
            ${escapeHtml(status)}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

/* DASHBOARD STATISTICS */

function renderStats(candidates) {
  const total = document.getElementById("statCandidates");
  const processed = document.getElementById("statProcessed");
  const strong = document.getElementById("statStrong");
  const top = document.getElementById("statTop");

  if (total) total.textContent = candidates.length;

  if (processed) {
    processed.textContent = candidates.filter(candidate =>
      Number.isFinite(Number(candidate.matchScore))
    ).length;
  }

  if (strong) {
    strong.textContent = candidates.filter(
      candidate => Number(candidate.matchScore || 0) >= 80
    ).length;
  }

  if (top) {
    const highest = candidates.length
      ? Math.max(
          ...candidates.map(candidate =>
            Number(candidate.matchScore || 0)
          )
        )
      : 0;

    top.textContent = `${highest}%`;
  }
}

/* SKILL MATRIX */

function renderSkills(candidates) {
  const box = document.getElementById("skillMatrix");
  if (!box) return;

  box.innerHTML = REQUIRED.map(skill => {
    const count = candidates.filter(candidate => {
      const skills = normalizeSkills(
        candidate.matchedSkills ?? candidate.skills
      );

      return skills.some(item =>
        item.toLowerCase().includes(skill.toLowerCase())
      );
    }).length;

    const percentage = candidates.length
      ? Math.round((count / candidates.length) * 100)
      : 0;

    return `
      <div class="skill-row">
        <span>${escapeHtml(skill)}</span>
        <div class="bar">
          <i style="width:${percentage}%"></i>
        </div>
        <b>${percentage}%</b>
      </div>
    `;
  }).join("");
}

/* HIRING PIPELINE */

function renderPipeline(candidates) {
  const box = document.getElementById("pipelineStats");
  if (!box) return;

  const counts = {
    Excellent: 0,
    Strong: 0,
    Good: 0,
    Moderate: 0,
    Low: 0
  };

  candidates.forEach(candidate => {
    const score = Number(candidate.matchScore || 0);

    if (score >= 90) counts.Excellent++;
    else if (score >= 80) counts.Strong++;
    else if (score >= 70) counts.Good++;
    else if (score >= 60) counts.Moderate++;
    else counts.Low++;
  });

  const maximum = Math.max(1, ...Object.values(counts));

  box.innerHTML = Object.entries(counts).map(([name, count]) => `
    <div class="pipeline-row">
      <span>${name} Match</span>

      <div class="matrix-track">
        <span style="width:${(count / maximum) * 100}%"></span>
      </div>

      <b>${count}</b>
    </div>
  `).join("");
}

/* PDF TEXT EXTRACTION */

async function loadPdfJs() {
  if (window.pdfjsLib) {
    return window.pdfjsLib;
  }

  await new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-pdfjs="true"]'
    );

    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");

    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";

    script.dataset.pdfjs = "true";

    script.onload = resolve;
    script.onerror = () =>
      reject(new Error("Could not load the PDF extraction library."));

    document.head.appendChild(script);
  });

  if (!window.pdfjsLib) {
    throw new Error("PDF.js did not initialize.");
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  return window.pdfjsLib;
}

async function extractResume(file, pdfjs) {
  const pdf = await pdfjs.getDocument({
    data: await file.arrayBuffer()
  }).promise;

  const pageTexts = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    pageTexts.push(
      content.items.map(item => item.str || "").join(" ")
    );
  }

  const resumeText = pageTexts.join("\n").trim();

  if (!resumeText) {
    throw new Error(
      "No selectable text found. This PDF may be scanned and require OCR."
    );
  }

  const emailMatch = resumeText.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );

  const filenameName = file.name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const beforeEmail = emailMatch
    ? resumeText.slice(0, emailMatch.index)
    : resumeText;

  const cleanedText = beforeEmail
    .replace(/[|•·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const headingPosition = cleanedText.search(
    /\b(PROFESSIONAL SUMMARY|SUMMARY|EDUCATION|TECHNICAL SKILLS|SKILLS|EXPERIENCE|PROJECTS|CAREER OBJECTIVE)\b/i
  );

  const prefix = headingPosition >= 0
    ? cleanedText.slice(0, headingPosition).trim()
    : cleanedText;

  const looksLikeName = value =>
    /^[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){1,3}$/.test(value) &&
    !/\b(Intern|Engineer|Developer|Student|Summary|Resume|Curriculum|Vitae)\b/i.test(value);

  const firstTwoWords = prefix.split(/\s+/).slice(0, 2).join(" ");

  let candidateName;

  if (looksLikeName(prefix)) {
    candidateName = prefix;
  } else if (looksLikeName(firstTwoWords)) {
    candidateName = firstTwoWords;
  } else if (looksLikeName(filenameName)) {
    candidateName = filenameName;
  } else {
    candidateName = filenameName || "Candidate";
  }

  return {
    resumeText,
    candidateName,
    email: emailMatch
      ? emailMatch[0]
      : ""
  };
}

/* BULK PROCESSING */

async function handleResume(event) {
  const files = Array.from(event.target.files || []);

  const status = document.getElementById("uploadStatus");

  if (!files.length || processingBatch) return;

  if (files.length > MAX_FILES_PER_BATCH) {
    status.textContent =
      `Select no more than ${MAX_FILES_PER_BATCH} PDFs in one batch.`;

    event.target.value = "";
    return;
  }

  if (files.some(file => !file.name.toLowerCase().endsWith(".pdf"))) {
    status.textContent = "Please select PDF files only.";
    event.target.value = "";
    return;
  }

  processingBatch = true;

  const progressPanel = document.getElementById("bulkProgressPanel");
  const progressLabel = document.getElementById("bulkProgressLabel");
  const progressCount = document.getElementById("bulkProgressCount");
  const progressBar = document.getElementById("bulkProgressBar");
  const successCount = document.getElementById("bulkSuccessCount");
  const failedCount = document.getElementById("bulkFailedCount");
  const selectedCount = document.getElementById("bulkSelectedCount");
  const fileResults = document.getElementById("bulkFileResults");
  const resultsBox = document.getElementById("bulkResults");

  if (progressPanel) progressPanel.style.display = "block";
  if (selectedCount) selectedCount.textContent = files.length;
  if (successCount) successCount.textContent = "0";
  if (failedCount) failedCount.textContent = "0";
  if (progressBar) progressBar.style.width = "0%";
  if (progressCount) {
    progressCount.textContent = `0 / ${files.length} (0%)`;
  }
  if (fileResults) fileResults.innerHTML = "";

  if (resultsBox) {
    resultsBox.innerHTML = "";
  }

  processedThisSession = [];

  let succeeded = 0;
  let failed = 0;

  try {
    status.textContent = "Loading PDF extraction engine...";

    const pdfjs = await loadPdfJs();

    for (let index = 0; index < files.length; index++) {
      const file = files[index];

      if (progressLabel) {
        progressLabel.textContent =
          `Processing ${index + 1} of ${files.length}: ${file.name}`;
      }

      status.textContent =
        `Processing ${index + 1}/${files.length}: ${file.name}`;

      try {
        const resume = await extractResume(file, pdfjs);

        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            candidateName: resume.candidateName,
            email: resume.email,
            resumeText: resume.resumeText,
            fileName: file.name
          })
        });

        const result = await readApiResponse(response);

        const candidate = {
          ...result,
          candidateName:
            result.candidateName || resume.candidateName,
          email: result.email || resume.email,
          matchScore: Number(result.matchScore || 0),
          classification:
            result.classification ||
            classification(Number(result.matchScore || 0)),
          matchedSkills: normalizeSkills(result.matchedSkills),
          missingSkills: normalizeSkills(result.missingSkills),
          status: result.status || "AI_PROCESSED",
          fileName: file.name
        };

        succeeded++;
        processedThisSession.push(candidate);

        renderBulkResult(candidate);
        addFileResult(file.name, true, "Processed successfully");

        addAudit(
          `Resume processed · ${candidate.candidateName} · ${candidate.matchScore}%`
        );
      } catch (error) {
        failed++;

        console.error(`Failed to process ${file.name}:`, error);

        addFileResult(
          file.name,
          false,
          error.message || "Processing failed"
        );

        addAudit(`Resume failed · ${file.name}`);
      }

      const completed = index + 1;
      const percentage = Math.round((completed / files.length) * 100);

      if (progressBar) {
        progressBar.style.width = `${percentage}%`;
      }

      if (progressCount) {
        progressCount.textContent =
          `${completed} / ${files.length} (${percentage}%)`;
      }

      if (successCount) successCount.textContent = succeeded;
      if (failedCount) failedCount.textContent = failed;
    }

    status.textContent =
      `Batch completed: ${succeeded} succeeded, ${failed} failed.`;

    if (progressLabel) {
      progressLabel.textContent = "Bulk processing complete";
    }

    // Refresh AWS-backed table and dashboard after batch completion.
    await loadCandidates();
  } catch (error) {
    console.error("Bulk processing failed:", error);

    status.textContent =
      error.message || "Unable to load PDF processing resources.";
  } finally {
    processingBatch = false;
    event.target.value = "";
  }
}

/* SHOW EACH CANDIDATE RESULT */

function renderBulkResult(candidate) {
  const resultsBox = document.getElementById("bulkResults");
  if (!resultsBox) return;

  const score = Number(candidate.matchScore || 0);
  const decision = candidate.classification || classification(score);

  const matched = normalizeSkills(candidate.matchedSkills);
  const missing = normalizeSkills(candidate.missingSkills);

  const card = document.createElement("article");
  card.className = "bulk-result-card";

  card.innerHTML = `
    <div>
      <h3>${escapeHtml(candidate.candidateName || "Candidate")}</h3>

      <div class="candidate-meta">
        ${escapeHtml(candidate.email || "Email not found")}
      </div>

      <div class="candidate-meta">
        File: ${escapeHtml(candidate.fileName || "PDF resume")}
      </div>

      <div class="match-score">
        ${score}% Match
      </div>

      <div>
        <span class="badge ${badgeClass(decision)}">
          ${escapeHtml(decision)}
        </span>

        <span class="badge ${badgeClass(decision)}">
          ${escapeHtml(candidate.status || "AI_PROCESSED")}
        </span>
      </div>

      <div class="skills-result">
        <strong>Matched Skills (${matched.length})</strong>
        <div class="skill-list">
          ${
            matched.length
              ? matched.map(skill =>
                  `<span class="skill-tag matched">✓ ${escapeHtml(skill)}</span>`
                ).join("")
              : '<span class="muted">No matched skills returned by the API.</span>'
          }
        </div>
      </div>

      <div class="skills-result">
        <strong>Missing Skills (${missing.length})</strong>
        <div class="skill-list">
          ${
            missing.length
              ? missing.map(skill =>
                  `<span class="skill-tag missing">✗ ${escapeHtml(skill)}</span>`
                ).join("")
              : '<span class="muted">No missing skills returned by the API.</span>'
          }
        </div>
      </div>
    </div>

    <div class="candidate-score-badge">
      ${score}%
    </div>
  `;

  resultsBox.prepend(card);
}

/* FILE-BY-FILE STATUS */

function addFileResult(fileName, success, message) {
  const list = document.getElementById("bulkFileResults");
  if (!list) return;

  const item = document.createElement("li");

  item.className = success ? "" : "status-danger";
  item.textContent =
    `${success ? "✓" : "✗"} ${fileName} — ${message}`;

  list.appendChild(item);
}

/* AUDIT LOG */

function addAudit(message) {
  const box = document.getElementById("auditLog");
  if (!box) return;

  const entry = document.createElement("div");

  entry.textContent =
    new Date().toLocaleTimeString() + " · " + message;

  box.prepend(entry);

  while (box.children.length > 5) {
    box.lastChild.remove();
  }
}

/* HTML ESCAPING */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}
