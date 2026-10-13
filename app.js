
const API_URL = "https://xhrw4xpw61.execute-api.ap-south-1.amazonaws.com/candidates";

const COGNITO_URL = "https://ap-south-1jxvmptg5m.auth.ap-south-1.amazoncognito.com/oauth2/authorize?client_id=16h7nk3soiq43cv8fat01t473a&response_type=code&scope=openid%20email&redirect_uri=http%3A%2F%2F127.0.0.1%3A5500%2Ffrontend%2Findex.html";

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
      document.querySelectorAll(".nav-item")
        .forEach(x => x.classList.remove("active"));

      a.classList.add("active");
    });
  });
}

async function loadCandidates() {
  const table = document.getElementById("candidateTable");

  table.innerHTML =
    `<tr><td colspan="6" class="empty">Loading candidates from AWS...</td></tr>`;

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
      `<tr><td colspan="6" class="empty">Unable to load AWS candidates. Check API Gateway.</td></tr>`;

    addAudit("Candidate API connection failed");
  }
}

function renderCandidates(candidates) {
  const table = document.getElementById("candidateTable");

  if (!candidates.length) {
    table.innerHTML =
      `<tr><td colspan="6" class="empty">No candidates found.</td></tr>`;
    return;
  }

  table.innerHTML = candidates.map((c, i) => {
    const score = Number(c.matchScore || 0);
    const cls = c.classification || classification(score);
    const badge = badgeClass(cls);

    const rawSkills = c.matchedSkills || c.skills || "";
    const skillList = Array.isArray(rawSkills)
      ? rawSkills
      : String(rawSkills).split(",");

    const skills = skillList
      .filter(Boolean)
      .slice(0, 4)
      .map(s => `<span class="skill-chip">${escapeHtml(s.trim())}</span>`)
      .join("");

    return `<tr>
      <td>#${i + 1}</td>
      <td>
        <span class="candidate-name">${escapeHtml(c.candidateName || "Candidate")}</span>
        <br><small>${escapeHtml(c.email || "")}</small>
      </td>
      <td>${skills || "—"}</td>
      <td class="score">${score}%</td>
      <td><span class="badge ${badge}">${escapeHtml(cls)}</span></td>
      <td><span class="badge ${c.status === "AI_PROCESSED" ? "excellent" : "moderate"}">${escapeHtml(c.status || "RECEIVED")}</span></td>
    </tr>`;
  }).join("");
}

function renderStats(cs) {
  document.getElementById("statCandidates").textContent = cs.length;

  document.getElementById("statProcessed").textContent =
    cs.filter(c => c.status === "AI_PROCESSED").length;

  document.getElementById("statStrong").textContent =
    cs.filter(c => Number(c.matchScore || 0) >= 80).length;

  document.getElementById("statTop").textContent =
    cs.length
      ? Math.max(...cs.map(c => Number(c.matchScore || 0))) + "%"
      : "0%";
}

function renderSkills(cs) {
  const box = document.getElementById("skillMatrix");

  box.innerHTML = REQUIRED.map(skill => {
    let count = 0;

    cs.forEach(c => {
      const rawSkills = c.matchedSkills || c.skills || "";
      const text = (Array.isArray(rawSkills)
        ? rawSkills.join(",")
        : String(rawSkills)).toLowerCase();

      if (text.includes(skill.toLowerCase())) {
        count++;
      }
    });

    const pct = cs.length
      ? Math.round(count / cs.length * 100)
      : 0;

    return `<div class="skill-row">
      <span>${skill}</span>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <b>${pct}%</b>
    </div>`;
  }).join("");
}

function renderPipeline(cs) {
  const counts = {
    Excellent: 0,
    Strong: 0,
    Good: 0,
    Moderate: 0,
    Low: 0
  };

  cs.forEach(c => {
    const s = Number(c.matchScore || 0);

    if (s >= 90) counts.Excellent++;
    else if (s >= 80) counts.Strong++;
    else if (s >= 70) counts.Good++;
    else if (s >= 60) counts.Moderate++;
    else counts.Low++;
  });

  document.getElementById("pipelineStats").innerHTML =
    Object.entries(counts).map(([k, v]) =>
      `<div class="pipeline-row"><span>${k} Match</span><b>${v}</b></div>`
    ).join("");
}

// BULK RESUME PROCESSING
async function handleResume(e) {
  const files = Array.from(e.target.files || []);
  const status = document.getElementById("uploadStatus");
  const result = document.getElementById("resultCard");

  if (!files.length) return;

  if (files.length > 10) {
    status.textContent =
      "Please select a maximum of 10 PDF resumes per batch.";

    e.target.value = "";
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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        if (!file.name.toLowerCase().endsWith(".pdf")) {
          throw new Error("Please select a PDF file.");
        }

        status.textContent =
          `Processing ${i + 1}/${files.length}: ${file.name}`;

        const data = await file.arrayBuffer();

        const pdf = await pdfjs.getDocument({ data }).promise;

        let resumeText = "";

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();

          resumeText +=
            content.items.map(item => item.str || "").join(" ") + "\n";
        }

        resumeText = resumeText.trim();

        if (!resumeText) {
          throw new Error(
            "No selectable text found. The PDF may be scanned."
          );
        }

        const nameMatch = resumeText.match(
          /(?:full\s*name|candidate\s*name|name)\s*[:\-]\s*([^\r\n]+)/i
        );

        const candidateName =
          nameMatch?.[1]?.trim() ||
          file.name.replace(/\.pdf$/i, "").replace(/[_-]/g, " ");

        const emailMatch = resumeText.match(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
        );

        status.textContent =
          `Sending ${i + 1}/${files.length} to AWS: ${file.name}`;

        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            candidateName,
            email: emailMatch ? emailMatch[0] : "candidate@talentpulse.ai",
            resumeText,
            fileName: file.name
          })
        });

        const raw = await response.json();

        const candidate =
          typeof raw.body === "string"
            ? JSON.parse(raw.body)
            : (raw.body || raw);

        if (
          !response.ok ||
          Number(raw.statusCode || 0) >= 400
        ) {
          throw new Error(
            candidate.message ||
            candidate.error ||
            `API request failed: HTTP ${response.status}`
          );
        }

        if (candidate.error) {
          throw new Error(candidate.error);
        }

        document.getElementById("resultName").textContent =
          candidate.candidateName || candidateName;

        document.getElementById("resultScore").textContent =
          (candidate.matchScore ?? 0) + "%";

        document.getElementById("resultClass").textContent =
          candidate.classification ||
          classification(Number(candidate.matchScore || 0));

        document.getElementById("resultStatus").textContent =
          candidate.status || "PROCESSED";

        const matched = Array.isArray(candidate.matchedSkills)
          ? candidate.matchedSkills
          : String(candidate.matchedSkills || "")
              .split(",").filter(Boolean);

        const missing = Array.isArray(candidate.missingSkills)
          ? candidate.missingSkills
          : String(candidate.missingSkills || "")
              .split(",").filter(Boolean);

        document.getElementById("matchedSkills").innerHTML =
          matched.map(s =>
            `<span class="skill-chip">✓ ${escapeHtml(s)}</span>`
          ).join("") || "None";

        document.getElementById("missingSkills").innerHTML =
          missing.map(s =>
            `<span class="missing-chip">✗ ${escapeHtml(s)}</span>`
          ).join("") || "None";

        result.classList.remove("hidden");

        succeeded++;

        addAudit(
          `Resume analyzed · ${candidate.candidateName || candidateName} · ${candidate.matchScore ?? 0}%`
        );

      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err);

        failures.push({
          file: file.name,
          reason: err.message
        });
      }
    }

    // Refresh the candidate dashboard after processing the batch.
    await loadCandidates();

    status.textContent =
      `Bulk processing finished: ${succeeded}/${files.length} succeeded; ` +
      `${failures.length} failed.`;

    if (failures.length) {
      console.table(failures);
      addAudit(`${failures.length} resume(s) failed during bulk processing`);
    } else {
      addAudit(`Bulk processing completed · ${succeeded} resumes`);
    }

  } catch (err) {
    console.error(err);
    status.textContent = "Bulk processing error: " + err.message;

  } finally {
    e.target.value = "";
  }
}

function classification(s) {
  if (s >= 90) return "Excellent Match";
  if (s >= 80) return "Strong Match";
  if (s >= 70) return "Good Match";
  if (s >= 60) return "Moderate Match";
  return "Low Match";
}

function badgeClass(c) {
  if (c.includes("Excellent")) return "excellent";
  if (c.includes("Strong")) return "strong";
  if (c.includes("Good")) return "good";
  if (c.includes("Moderate")) return "moderate";
  return "low";
}

function addAudit(msg) {
  const box = document.getElementById("auditLog");

  const d = document.createElement("div");
  d.textContent = new Date().toLocaleTimeString() + " · " + msg;

  box.prepend(d);

  while (box.children.length > 5) {
    box.lastChild.remove();
  }
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}
