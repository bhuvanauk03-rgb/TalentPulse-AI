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
  document.querySelectorAll(".nav-item").forEach(link => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
      });
      link.classList.add("active");
    });
  });
}

async function loadCandidates() {
  const table = document.getElementById("candidateTable");
  table.innerHTML =
    '<tr><td colspan="6" class="empty">Loading candidates from AWS...</td></tr>';

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const raw = await response.json();
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
  } catch (error) {
    console.error(error);
    table.innerHTML =
      '<tr><td colspan="6" class="empty">Unable to load AWS candidates. Check API Gateway.</td></tr>';
    addAudit("Candidate API connection failed");
  }
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    return value.split(",").map(skill => skill.trim()).filter(Boolean);
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

  table.innerHTML = candidates.map((candidate, index) => {
    const score = Number(candidate.matchScore || 0);
    const decision =
      candidate.classification || classification(score);

    const skills = normalizeSkills(
      candidate.matchedSkills ?? candidate.skills
    ).slice(0, 4).map(skill =>
      `<span class="skill-chip">${escapeHtml(skill)}</span>`
    ).join("");

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
          <span class="badge ${
            candidate.status === "AUTOMATED_PROCESSED" ? "excellent" : "moderate"
          }">
            ${escapeHtml(candidate.status || "RECEIVED")}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

function renderStats(candidates) {
  document.getElementById("statCandidates").textContent =
    candidates.length;

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
        <div class="bar"><i style="width:${percentage}%"></i></div>
        <b>${percentage}%</b>
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

  candidates.forEach(candidate => {
    const score = Number(candidate.matchScore || 0);

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

// Extract PDF text and determine the candidate's name.
async function extractResume(file, pdfjs) {
  const pdf = await pdfjs.getDocument({
    data: await file.arrayBuffer()
  }).promise;

  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    pageTexts.push(
      content.items.map(item => item.str || "").join(" ")
    );
  }

  const resumeText = pageTexts.join("\n").trim();

  if (!resumeText) {
    throw new Error(
      "No selectable text found. This PDF may be scanned and need OCR."
    );
  }

  const emailMatch = resumeText.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );

  // Dataset filenames such as Rohan_Patel.pdf provide a useful name.
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

  // Remove common headings and contact details from the name candidate.
  const headingPosition = cleanedText.search(
    /\b(PROFESSIONAL SUMMARY|SUMMARY|EDUCATION|TECHNICAL SKILLS|SKILLS|EXPERIENCE|PROJECTS|CAREER OBJECTIVE)\b/i
  );

  const prefix = headingPosition >= 0
    ? cleanedText.slice(0, headingPosition).trim()
    : cleanedText;

  const firstWords = prefix.split(/\s+/).filter(Boolean);

  const looksLikeName = value =>
    /^[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){1,3}$/.test(value) &&
    !/\b(Intern|Engineer|Developer|Student|Summary|Resume|Curriculum|Vitae)\b/i.test(value);

  let candidateName;

  // Prefer a human-looking name in the PDF text.
  if (looksLikeName(prefix)) {
    candidateName = prefix;
  } else if (
    firstWords.length >= 2 &&
    looksLikeName(firstWords.slice(0, 2).join(" "))
  ) {
    candidateName = firstWords.slice(0, 2).join(" ");
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
      : `no-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@talentpulse.invalid`
  };
}

// Process selected PDFs one at a time, up to 10 per batch.
async function handleResume(event) {
  const files = Array.from(event.target.files || []);
  const status = document.getElementById("uploadStatus");
  const resultCard = document.getElementById("resultCard");

  if (!files.length) return;

  if (files.length > MAX_FILES_PER_BATCH) {
    status.textContent =
      `Please select a maximum of ${MAX_FILES_PER_BATCH} PDFs per batch.`;
    event.target.value = "";
    return;
  }

  if (files.some(file => !file.name.toLowerCase().endsWith(".pdf"))) {
    status.textContent = "Please select PDF files only.";
    event.target.value = "";
    return;
  }

  let succeeded = 0;
  const failures = [];

  try {
    status.textContent = "Loading PDF extraction engine...";

    const pdfjs = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs"
    );

    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

    resultCard.classList.add("hidden");

    for (let index = 0; index < files.length; index++) {
      const file = files[index];

      status.textContent =
        `Processing ${index + 1} of ${files.length}: ${file.name}`;

      try {
        const resume = await extractResume(file, pdfjs);

        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateName: resume.candidateName,
            email: resume.email,
            resumeText: resume.resumeText,
            fileName: file.name
          })
        });

        const raw = await response.json();

        if (!response.ok) {
          throw new Error(
            raw.message || raw.error || `API error ${response.status}`
          );
        }

        let result = raw;

        if (typeof raw.body === "string") {
          try {
            result = JSON.parse(raw.body);
          } catch {
            throw new Error("Unexpected response returned by the API.");
          }
        } else if (raw.body && typeof raw.body === "object") {
          result = raw.body;
        }

        showResumeResult(result, resume.candidateName);

        addAudit(
          `Resume processed · ${result.candidateName || resume.candidateName} · ${result.matchScore ?? 0}%`
        );

        succeeded++;
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        failures.push(file.name);
        addAudit(`Resume failed · ${file.name}`);
      }
    }

    await loadCandidates();

    status.textContent = failures.length === 0
      ? `✓ Completed: ${succeeded}/${files.length} resumes processed successfully.`
      : `Completed: ${succeeded} succeeded, ${failures.length} failed. Failed files: ${failures.join(", ")}`;
  } catch (error) {
    console.error(error);
    status.textContent =
      "Unable to load the PDF reader. Check your internet connection.";
  } finally {
    event.target.value = "";
  }
}

function showResumeResult(result, fallbackName) {
  document.getElementById("resultName").textContent =
    result.candidateName || fallbackName;

  document.getElementById("resultScore").textContent =
    (result.matchScore ?? 0) + "%";

  document.getElementById("resultClass").textContent =
    result.classification ||
    classification(Number(result.matchScore || 0));

  document.getElementById("resultStatus").textContent =
    result.status || "AI_PROCESSED";

  document.getElementById("matchedSkills").innerHTML =
    normalizeSkills(result.matchedSkills).map(skill =>
      `<span class="skill-chip">✓ ${escapeHtml(skill)}</span>`
    ).join("") || "None";

  document.getElementById("missingSkills").innerHTML =
    normalizeSkills(result.missingSkills).map(skill =>
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

  entry.textContent =
    new Date().toLocaleTimeString() + " · " + message;

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
