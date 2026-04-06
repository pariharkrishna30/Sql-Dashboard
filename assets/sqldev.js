(function () {
  "use strict";

  var base = typeof window.SQLDEV_BASE === "string" ? window.SQLDEV_BASE : "./";
  var DARK_KEY = "sqldev_dark_v1";
  var FONT_KEY = "sqldev_editor_font_px";
  var ROW_CHUNK = 200;

  var fetchAbort = null;
  var progressTimer = null;
  var progressValue = 10;

  function $(id) {
    return document.getElementById(id);
  }

  function safeGet(key, def) {
    try {
      var v = localStorage.getItem(key);
      return v === null || v === undefined ? def : v;
    } catch (e) {
      return def;
    }
  }

  function safeSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      /* private mode / blocked storage */
    }
  }

  function bindClick(id, handler) {
    var el = $(id);
    if (el && el.addEventListener) {
      el.addEventListener("click", handler);
    }
  }

  function apiUrl() {
    return base + "api.php";
  }

  function setError(msg) {
    var el = $("sqldev-error");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function setStatus(text) {
    var el = $("sqldev-status");
    if (el) el.textContent = text || "";
  }

  function setLoadingUi(active, label) {
    var loader = $("sqldev-loader");
    var bar = $("sqldev-loader-bar");
    var track = $("sqldev-loader-track");
    var lbl = $("sqldev-loader-label");
    var panel = document.querySelector(".sqldev-result-panel");
    if (active) {
      progressValue = 10;
      if (bar) bar.style.width = "10%";
      if (track) track.setAttribute("aria-valuenow", "10");
      if (lbl) lbl.textContent = label || "Executing…";
      if (loader) {
        loader.hidden = false;
        loader.setAttribute("aria-hidden", "false");
        loader.setAttribute("aria-busy", "true");
      }
      if (panel) panel.setAttribute("aria-busy", "true");
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = setInterval(function () {
        if (progressValue < 88) {
          progressValue += Math.max(1, Math.round((88 - progressValue) * 0.08));
          if (progressValue > 88) progressValue = 88;
          if (bar) bar.style.width = progressValue + "%";
          if (track) track.setAttribute("aria-valuenow", String(progressValue));
        }
      }, 180);
    } else {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      if (bar) bar.style.width = "100%";
      if (track) track.setAttribute("aria-valuenow", "100");
      if (loader) {
        loader.setAttribute("aria-busy", "false");
      }
      if (panel) panel.removeAttribute("aria-busy");
      setTimeout(function () {
        if (loader) {
          loader.hidden = true;
          loader.setAttribute("aria-hidden", "true");
        }
        if (bar) bar.style.width = "10%";
        if (track) track.setAttribute("aria-valuenow", "10");
      }, 220);
    }
  }

  function setToolbarBusy(busy) {
    [
      "sqldev-run",
      "sqldev-structure",
      "sqldev-beautify",
      "sqldev-clear",
    ].forEach(function (id) {
      var b = $(id);
      if (b) b.disabled = !!busy;
    });
  }

  /**
   * Scan-based literal protection (reliable for very long queries; avoids regex backtracking).
   */
  function sqldevProtectLiterals(sql) {
    var ph = [];
    var out = "";
    var i = 0;
    var n = sql.length;
    while (i < n) {
      var c = sql[i];
      if (c === "'" || c === '"') {
        var start = i;
        var q = c;
        i++;
        while (i < n) {
          if (q === "'" && i + 1 < n && sql[i] === "'" && sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          if (q === '"' && i + 1 < n && sql[i] === '"' && sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          if (sql[i] === q) {
            i++;
            break;
          }
          if (sql[i] === "\\" && i + 1 < n) {
            i += 2;
            continue;
          }
          i++;
        }
        ph.push(sql.slice(start, i));
        out += "\uE000" + (ph.length - 1) + "\uE001";
        continue;
      }
      if (c === "`") {
        var startBt = i;
        i++;
        while (i < n) {
          if (i + 1 < n && sql[i] === "`" && sql[i + 1] === "`") {
            i += 2;
            continue;
          }
          if (sql[i] === "`") {
            i++;
            break;
          }
          i++;
        }
        ph.push(sql.slice(startBt, i));
        out += "\uE000" + (ph.length - 1) + "\uE001";
        continue;
      }
      out += c;
      i++;
    }
    return { s: out, ph: ph };
  }

  /**
   * Break commas at depth 0 — skips commas inside ().
   */
  function sqldevApplyCommaBreaks(sql) {
    var depth = 0;
    var out = "";
    for (var i = 0; i < sql.length; i++) {
      var c = sql[i];
      if (c === "(") {
        depth++;
      } else if (c === ")") {
        depth = Math.max(0, depth - 1);
      }
      if (c === "," && depth === 0) {
        out += ",";
        var j = i + 1;
        while (j < sql.length && /\s/.test(sql[j])) {
          j++;
        }
        if (j < sql.length) {
          out += "\n    ";
          i = j - 1;
          continue;
        }
        continue;
      }
      out += c;
    }
    return out;
  }

  /**
   * Format SQL: one clause per line (FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, UNION).
   * Uses word-boundary patterns so long single-line queries split reliably.
   */
  function sqldevBeautify(raw) {
    var input = String(raw);
    if (!input.trim()) {
      return input;
    }
    var prot = sqldevProtectLiterals(input.replace(/\r\n/g, "\n"));
    var s = prot.s;
    s = s.replace(/(?:--[^\n]*|\/\*[\s\S]*?\*\/)/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    if (!s) {
      return input.trim();
    }
    if (/^\s*SELECT\b/i.test(s)) {
      s = s.replace(/^\s*SELECT\s+/i, "SELECT\n    ");
    }
    var clauseRules = [
      [/\s+\bFROM\b\s+/gi, "\nFROM "],
      [/\s+\bLEFT\s+OUTER\s+JOIN\b\s+/gi, "\n    LEFT OUTER JOIN "],
      [/\s+\bRIGHT\s+OUTER\s+JOIN\b\s+/gi, "\n    RIGHT OUTER JOIN "],
      [/\s+\bFULL\s+OUTER\s+JOIN\b\s+/gi, "\n    FULL OUTER JOIN "],
      [/\s+\bINNER\s+JOIN\b\s+/gi, "\n    INNER JOIN "],
      [/\s+\bLEFT\s+JOIN\b\s+/gi, "\n    LEFT JOIN "],
      [/\s+\bRIGHT\s+JOIN\b\s+/gi, "\n    RIGHT JOIN "],
      [/\s+\bFULL\s+JOIN\b\s+/gi, "\n    FULL JOIN "],
      [/\s+\bCROSS\s+JOIN\b\s+/gi, "\n    CROSS JOIN "],
      [/\s+\bJOIN\b\s+/gi, "\n    JOIN "],
      [/\s+\bON\b\s+/gi, "\n    ON "],
      [/\s+\bWHERE\b\s+/gi, "\nWHERE "],
      [/\s+\bGROUP\s+BY\b\s+/gi, "\nGROUP BY "],
      [/\s+\bHAVING\b\s+/gi, "\nHAVING "],
      [/\s+\bORDER\s+BY\b\s+/gi, "\nORDER BY "],
      [/\s+\bLIMIT\b\s+/gi, "\nLIMIT "],
      [/\s+\bUNION\s+ALL\b\s+/gi, "\nUNION ALL\n"],
      [/\s+\bUNION\b\s+(?!\s*ALL\b)/gi, "\nUNION\n"],
    ];
    var r;
    for (r = 0; r < clauseRules.length; r++) {
      s = s.replace(clauseRules[r][0], clauseRules[r][1]);
    }
    s = sqldevApplyCommaBreaks(s);
    s = s.trim();
    for (r = 0; r < prot.ph.length; r++) {
      s = s.split("\uE000" + r + "\uE001").join(prot.ph[r]);
    }
    return s;
  }

  function showEmptyState(message) {
    var empty = $("sqldev-empty-state");
    var grid = $("sqldev-grid");
    if (empty) {
      empty.textContent =
        message || "Run a query or load table structure to see results here.";
      empty.hidden = false;
    }
    if (grid) {
      grid.innerHTML = "";
      grid.classList.add("sqldev-grid--hidden");
    }
    $("sqldev-copy").disabled = true;
    $("sqldev-export").disabled = true;
    var exp = $("sqldev-export-query");
    if (exp) exp.value = "";
  }

  function hideEmptyState() {
    var empty = $("sqldev-empty-state");
    if (empty) empty.hidden = true;
    var grid = $("sqldev-grid");
    if (grid) grid.classList.remove("sqldev-grid--hidden");
  }

  function appendRowsChunk(tbody, columns, rows, start, end) {
    var frag = document.createDocumentFragment();
    for (var r = start; r < end; r++) {
      var row = rows[r];
      var tr = document.createElement("tr");
      for (var c = 0; c < columns.length; c++) {
        var td = document.createElement("td");
        var col = columns[c];
        var v = row[col];
        if (v === null || v === undefined) {
          td.className = "null-cell";
          td.textContent = "NULL";
        } else {
          var text = String(v);
          // If cell contains more than 200 words, wrap content in a fixed-height scroller.
          var trimmed = text.trim();
          var isLong = false;
          if (trimmed) {
            // Primary: whitespace-separated words.
            var wsWords = trimmed.split(/\s+/);
            var wsCount = wsWords && wsWords.length ? wsWords.length : 0;
            // Fallback: count alphanumeric "word" tokens even if JSON is minified.
            var tokenMatches = trimmed.match(/[A-Za-z0-9_]+/g);
            var tokenCount =
              tokenMatches && tokenMatches.length ? tokenMatches.length : 0;
            isLong = wsCount > 200 || tokenCount > 200;
          }
          if (isLong) {
            td.className = td.className
              ? td.className + " sqldev-cell-long"
              : "sqldev-cell-long";
            var wrap = document.createElement("div");
            wrap.className = "sqldev-cell-scroll";
            wrap.textContent = text;
            td.textContent = "";
            td.appendChild(wrap);
          } else {
            td.textContent = text;
          }
        }
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  function renderGridChunked(columns, rows, done) {
    var table = $("sqldev-grid");
    if (!table) {
      if (done) done();
      return;
    }
    table.innerHTML = "";
    if (!columns || !columns.length) {
      showEmptyState("No rows returned.");
      setStatus("No rows.");
      if (done) done();
      return;
    }
    hideEmptyState();
    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    for (var h = 0; h < columns.length; h++) {
      var th = document.createElement("th");
      th.textContent = columns[h];
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    table.appendChild(tbody);
    var total = rows.length;
    if (total === 0) {
      $("sqldev-copy").disabled = true;
      $("sqldev-export").disabled = true;
      if (done) done();
      return;
    }
    var idx = 0;
    function step() {
      var end = Math.min(idx + ROW_CHUNK, total);
      appendRowsChunk(tbody, columns, rows, idx, end);
      idx = end;
      if (idx < total) {
        requestAnimationFrame(step);
      } else {
        $("sqldev-copy").disabled = false;
        $("sqldev-export").disabled = false;
        if (done) done();
      }
    }
    requestAnimationFrame(step);
  }

  function renderStructureChunked(rows, done) {
    var table = $("sqldev-grid");
    if (!table) {
      if (done) done();
      return;
    }
    hideEmptyState();
    table.innerHTML = "";
    var cols = [
      "Column Name",
      "Data Type",
      "NULL / NOT NULL",
      "Key",
      "Default",
      "Extra",
    ];
    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    for (var i = 0; i < cols.length; i++) {
      var th = document.createElement("th");
      th.textContent = cols[i];
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    table.appendChild(tbody);
    var total = rows.length;
    var idx = 0;
    function step() {
      var end = Math.min(idx + ROW_CHUNK, total);
      var frag = document.createDocumentFragment();
      for (var r = idx; r < end; r++) {
        var row = rows[r];
        var tr = document.createElement("tr");
        var cells = [
          row.Field,
          row.Type,
          row.Null === "YES" ? "NULL" : "NOT NULL",
          row.Key || "",
          row.Default === null || row.Default === undefined
            ? ""
            : String(row.Default),
          row.Extra || "",
        ];
        for (var c = 0; c < cells.length; c++) {
          var td = document.createElement("td");
          td.textContent = cells[c];
          tr.appendChild(td);
        }
        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
      idx = end;
      if (idx < total) {
        requestAnimationFrame(step);
      } else {
        $("sqldev-copy").disabled = total === 0;
        $("sqldev-export").disabled = true;
        if (done) done();
      }
    }
    requestAnimationFrame(step);
  }

  function postJson(body, signal) {
    return fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
      signal: signal,
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          throw new Error("Invalid server response.");
        }
        if (res.status === 401) {
          var login =
            typeof window.SQLDEV_LOGIN === "string"
              ? window.SQLDEV_LOGIN
              : "/secureAdmin/";
          window.location.href = login;
          throw new Error("Session expired.");
        }
        return { res: res, data: data };
      });
    });
  }

  function resetToInitialState() {
    if (fetchAbort) {
      fetchAbort.abort();
      fetchAbort = null;
    }
    setLoadingUi(false);
    setToolbarBusy(false);
    var ta = $("sqldev-query");
    if (ta) ta.value = "";
    var ti = $("sqldev-table");
    if (ti) ti.value = "";
    setError("");
    setStatus("");
	// ✅ Reset pagination UI
	var prevBtn = $("sqldev-prev");
	var nextBtn = $("sqldev-next");
	var pageInfo = $("sqldev-page-info");
  
	if (prevBtn) prevBtn.disabled = true;
	if (nextBtn) nextBtn.disabled = true;
	if (pageInfo) pageInfo.textContent = "Page 1";
	
    showEmptyState("Run a query or load table structure to see results here.");
  }

  async function runQuery() {
    if (fetchAbort) {
      fetchAbort.abort();
    }
    fetchAbort = new AbortController();
    var signal = fetchAbort.signal;

    var ta = $("sqldev-query");
    var query = ta ? ta.value : "";
    setError("");
    setStatus("");
    setLoadingUi(true, "Executing query…");
    setToolbarBusy(true);

    try {
      var out = await postJson({ action: "execute", query: query }, signal);
      var data = out.data;

      if (!data.ok) {
        setError(data.error || "Query failed.");
        showEmptyState("No results.");
        setStatus("");
        return;
      }
      var n = data.rowCount != null ? data.rowCount : (data.rows || []).length;
      var ms = data.durationMs != null ? data.durationMs + " ms" : "";
      setStatus(n + " row(s)" + (ms ? ", " + ms : ""));
      var exp = $("sqldev-export-query");
      if (exp) exp.value = query.trim();

      await new Promise(function (resolve) {
        renderGridChunked(data.columns || [], data.rows || [], resolve);
      });
    } catch (e) {
      if (e.name === "AbortError" || e.code === 20) {
        setStatus("Cancelled.");
        return;
      }
      setError(e.message || String(e));
      setStatus("");
      showEmptyState("No results.");
    } finally {
      setLoadingUi(false);
      setToolbarBusy(false);
      fetchAbort = null;
    }
  }

  // --- Pagination logic ---
  var currentPage = 1;
  var pageSize = 2000; // fixed per page

  var prevBtn = $("sqldev-prev");
  var nextBtn = $("sqldev-next");
  var pageInfo = $("sqldev-page-info");

  function fetchPage(page) {
    currentPage = page || 1;
    var ta = $("sqldev-query");
    var query = ta ? ta.value : "";
    if (!query) return;

    setLoadingUi(true, "Executing query…");
    setToolbarBusy(true);
    setError("");

    postJson({ action: "execute", query: query, page: currentPage })
      .then(function (res) {
        setLoadingUi(false);
        setToolbarBusy(false);

        var data = res.data;
        if (!data.ok) {
          setError(data.error || "Query failed.");
          showEmptyState("No results.");
          return;
        }

        renderGridChunked(data.columns || [], data.rows || []);
		var total = data.totalCount || data.rowCount || 0;
		var ms = data.durationMs != null ? data.durationMs + ' ms' : '';
		setStatus(`Page ${currentPage}: ${data.rowCount || 0} row(s) shown of ${total} total, ${ms}`);

		pageInfo.textContent = 'Page ' + currentPage + ' / ' + Math.ceil(total / pageSize);

		prevBtn.disabled = currentPage <= 1;
		nextBtn.disabled = currentPage * pageSize >= total;
      })
      .catch(function (err) {
        setLoadingUi(false);
        setToolbarBusy(false);
        setError(err.message || String(err));
        showEmptyState("No results.");
      });
  }

  // Pagination button events
  bindClick("sqldev-prev", function () {
    if (currentPage > 1) fetchPage(currentPage - 1);
  });
  bindClick("sqldev-next", function () {
    fetchPage(currentPage + 1);
  });

  // Override runQuery to start at page 1
  var originalRunQuery = runQuery;
  runQuery = function () {
    currentPage = 1;
    fetchPage(currentPage);
  };

  async function runStructure() {
    if (fetchAbort) {
      fetchAbort.abort();
    }
    fetchAbort = new AbortController();
    var signal = fetchAbort.signal;

    var inp = $("sqldev-table");
    var table = inp ? inp.value.trim() : "";
    setError("");
    setStatus("");
    setLoadingUi(true, "Loading table structure…");
    setToolbarBusy(true);

    try {
      var out = await postJson({ action: "structure", table: table }, signal);
      var data = out.data;
      if (!data.ok) {
        setError(data.error || "Failed.");
        showEmptyState("No results.");
        setStatus("");
        return;
      }
      setStatus((data.columns || []).length + " column(s)");
      await new Promise(function (resolve) {
        renderStructureChunked(data.columns || [], resolve);
      });
    } catch (e) {
      if (e.name === "AbortError" || e.code === 20) {
        setStatus("Cancelled.");
        return;
      }
      setError(e.message || String(e));
      setStatus("");
      showEmptyState("No results.");
    } finally {
      setLoadingUi(false);
      setToolbarBusy(false);
      fetchAbort = null;
    }
  }

  function copyTsv() {
    var table = $("sqldev-grid");
    if (
      !table ||
      table.classList.contains("sqldev-grid--hidden") ||
      !table.rows.length
    )
      return;
    var lines = [];
    var headerCells = table.rows[0].cells;
    var headers = [];
    for (var h = 0; h < headerCells.length; h++) {
      headers.push(headerCells[h].textContent.replace(/\t/g, " "));
    }
    lines.push(headers.join("\t"));
    for (var r = 1; r < table.rows.length; r++) {
      var cells = table.rows[r].cells;
      var row = [];
      for (var c = 0; c < cells.length; c++) {
        row.push(
          cells[c].textContent.replace(/\t/g, " ").replace(/\r?\n/g, " "),
        );
      }
      lines.push(row.join("\t"));
    }
    var text = lines.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          setStatus("Copied to clipboard.");
        })
        .catch(function () {
          setStatus("Copy failed.");
        });
    } else {
      setStatus("Clipboard API not available.");
    }
  }

  function applyDark(on) {
    var b = document.body;
    if (b) {
      b.classList.toggle("dark", !!on);
    }
    try {
      document.documentElement.style.colorScheme = on ? "dark" : "light";
    } catch (e) {
      /* ignore */
    }
    safeSet(DARK_KEY, on ? "1" : "0");
    var cb = $("sqldev-dark");
    if (cb) {
      cb.checked = !!on;
    }
  }

  function applyFont(px) {
    px = Math.min(28, Math.max(11, px));
    document.documentElement.style.setProperty(
      "--sqldev-editor-size",
      px + "px",
    );
    var ta = $("sqldev-query");
    if (ta) {
      ta.style.fontSize = px + "px";
    }
    safeSet(FONT_KEY, String(px));
  }

  function wireDarkMode() {
    var cb = $("sqldev-dark");
    if (!cb) {
      return;
    }
    function syncFromControl() {
      applyDark(!!cb.checked);
    }
    cb.addEventListener("change", syncFromControl);
    cb.addEventListener("input", syncFromControl);
    /* click order: checked updates before change in most engines; rAF covers edge cases */
    var raf =
      window.requestAnimationFrame ||
      function (fn) {
        return setTimeout(fn, 0);
      };
    cb.addEventListener("click", function () {
      raf(syncFromControl);
    });
  }

  function init() {
    if (safeGet(DARK_KEY, "") === "1") {
      applyDark(true);
    } else {
      applyDark(false);
    }
    var fp = parseInt(safeGet(FONT_KEY, "15"), 10);
    if (!isNaN(fp)) {
      applyFont(fp);
    } else {
      applyFont(15);
    }

    bindClick("sqldev-run", runQuery);
    bindClick("sqldev-beautify", function () {
      var ta = $("sqldev-query");
      if (!ta) return;
      var before = ta.value;
      if (!String(before).trim()) {
        setStatus("");
        return;
      }
      var next = sqldevBeautify(before);
      ta.value = next;
      try {
        ta.focus();
        ta.setSelectionRange(next.length, next.length);
      } catch (e) {
        /* ignore */
      }
      setStatus(next !== before ? "SQL formatted." : "Already formatted.");
    });
    bindClick("sqldev-clear", resetToInitialState);
    bindClick("sqldev-structure", runStructure);
    bindClick("sqldev-copy", copyTsv);

    wireDarkMode();

    bindClick("sqldev-zoom-in", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var cur = parseInt(safeGet(FONT_KEY, "15"), 10) || 15;
      applyFont(cur + 1);
    });
    bindClick("sqldev-zoom-out", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var cur = parseInt(safeGet(FONT_KEY, "15"), 10) || 15;
      applyFont(cur - 1);
    });

    var form = $("sqldev-export-form");
    if (form) {
      form.addEventListener("submit", function () {
        var ta = $("sqldev-query");
        var exp = $("sqldev-export-query");
        if (ta && exp) exp.value = ta.value.trim();
      });
    }

    var ta = $("sqldev-query");
    if (ta) {
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          runQuery();
        }
      });
    }

    showEmptyState("Run a query or load table structure to see results here.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
