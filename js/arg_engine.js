/**
 * 文化祭ARG コアエンジン (arg_engine.js) v2.0
 * - トピック辞書型対話エンジン（各行1秒の「入力中…」ディレイ）
 * - 実時刻タイムスタンプ（HH:MM・端末の現在時刻を保持）
 * - 未登録キーワード時の通信阻害エラー（プレイヤー吹き出しなし・軽いノイズ演出）
 * - 3回ミス機能廃止（手動💡ヒントボタン対応）
 * - 6種ホラー演出・LocalStorage共有
 * - 探索用Webページの進行度連動レンダリング
 * - #staff00 運営・デバッグメニュー
 */
(function () {
  const STORAGE_KEY = "bunkasai_arg_state_v2";

  // 初期状態の作成または読み込み
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.currentScene) return parsed;
      }
    } catch (e) {
      console.warn("LocalStorage読み込み失敗:", e);
    }
    return {
      currentScene: "chap1_start",
      unlockedFlags: ["init", "chap1_start"],
      messageLog: []
    };
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("LocalStorage保存失敗:", e);
    }
  }

  function getCurrentTimeStr() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  // 表記ゆれ吸収（Python側の normalize_keyword と完全一致）
  function normalizeInput(text) {
    if (!text) return "";
    let s = text.trim().normalize("NFKC");
    const removeChars = [" ", "　", "\t", "\n", "・", "「", "」", "『", "』", "（", "）", "(", ")"];
    for (const ch of removeChars) {
      s = s.split(ch).join("");
    }
    s = s.toLowerCase();
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code >= 0x3041 && code <= 0x3096) {
        out += String.fromCharCode(code + 0x60);
      } else {
        out += s[i];
      }
    }
    return out;
  }

  // メッセージ内の pages/xxx.html をクリック可能なリンクに変換
  function linkifyMessage(text) {
    if (!text) return "";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/(pages\/[a-zA-Z0-9_]+\.html)/g, function (match) {
      let label = match;
      if (match.includes("club.html")) label = "🎵 音紡ぎ同好会 公式アーカイブ (" + match + ")";
      if (match.includes("urban.html")) label = "👁️ 怪異調査録まとめブログ (" + match + ")";
      if (match.includes("bbs.html")) label = "💬 裏キャンパスBBS (" + match + ")";
      return `<a href="${match}">${label}</a>`;
    });
  }

  // SVGイラスト生成（外部画像ファイルがなくても100%表示される組み込みベクター）
  function renderMediaSVG(mediaName) {
    if (mediaName === "photo_room.svg") {
      return `<svg viewBox="0 0 320 160" width="100%" style="display:block;background:#111827">
        <rect x="10" y="10" width="300" height="140" fill="#1e293b" stroke="#334155"/>
        <rect x="30" y="25" width="90" height="70" fill="#0f172a" stroke="#475569"/>
        <text x="75" y="65" fill="#64748b" font-size="10" text-anchor="middle">窓の外：深い霧</text>
        <circle cx="240" cy="55" r="28" fill="#0f172a" stroke="#94a3b8" stroke-width="2"/>
        <line x1="240" y1="55" x2="240" y2="35" stroke="#f43f5e" stroke-width="2"/>
        <line x1="240" y1="55" x2="256" y2="55" stroke="#e2e8f0" stroke-width="2"/>
        <text x="240" y="98" fill="#fda4af" font-size="10" text-anchor="middle">時計：17:00で停止</text>
        <rect x="125" y="95" width="70" height="45" fill="#090d16" stroke="#38bdf8"/>
        <text x="160" y="118" fill="#38bdf8" font-size="9" text-anchor="middle">LOCK: 〇〇〇のうた</text>
      </svg>`;
    }
    if (mediaName === "photo_calendar.svg") {
      return `<svg viewBox="0 0 320 150" width="100%" style="display:block;background:#0f172a">
        <rect x="20" y="15" width="280" height="120" rx="8" fill="#1e293b" stroke="#f43f5e" stroke-dasharray="4 2"/>
        <text x="160" y="48" fill="#fda4af" font-size="12" text-anchor="middle">📱 ヒカネのスマートフォン画面</text>
        <text x="160" y="82" fill="#ffffff" font-size="20" font-weight="bold" text-anchor="middle">2023年 10月 10日 (火)</text>
        <text x="160" y="112" fill="#94a3b8" font-size="11" text-anchor="middle">第58回 大学文化祭 1日目（今から3年前）</text>
      </svg>`;
    }
    if (mediaName === "photo_letter.svg") {
      return `<svg viewBox="0 0 320 150" width="100%" style="display:block;background:#1c1917">
        <rect x="20" y="12" width="280" height="126" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
        <text x="40" y="42" fill="#451a03" font-size="12" font-weight="bold">ポップコーンを買ってくれたあなたへ</text>
        <text x="40" y="68" fill="#78350f" font-size="11">3年前、暗闇の中で私を呼んでくれたあなたの声を</text>
        <text x="40" y="88" fill="#78350f" font-size="11">私はずっと忘れませんでした。見つけてくれてありがとう。</text>
        <text x="275" y="120" fill="#92400e" font-size="12" font-weight="bold" text-anchor="end">— 4年 ヒカネ</text>
      </svg>`;
    }
    return `<img src="assets/${mediaName}" alt="添付画像" style="max-width:100%;display:block;">`;
  }

  // Web Audio API による音響効果
  function playSynthVoice(type) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === "buzz_jammed") {
      // 通信阻害時の短く不気味なノイズパルス
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
      return;
    }

    if (type === "voice_warning.synth" || type === "voice_bad.synth") {
      const freqs = type === "voice_bad.synth" ? [220, 207, 196, 164] : [330, 311, 293, 246];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(f, now + idx * 0.28);
        gain.gain.setValueAtTime(0.08, now + idx * 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.28 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.28);
        osc.stop(now + idx * 0.28 + 0.26);
      });
    } else if (type === "voice_bell.synth") {
      const notes = [523.25, 659.25, 587.33, 392.0];
      notes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + idx * 0.45);
        gain.gain.setValueAtTime(0.12, now + idx * 0.45);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.45 + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.45);
        osc.stop(now + idx * 0.45 + 0.44);
      });
    } else {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, now + idx * 0.25);
        gain.gain.setValueAtTime(0.14, now + idx * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.25 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.25);
        osc.stop(now + idx * 0.25 + 0.52);
      });
    }
  }

  // ===== チャット画面の初期化 =====
  function initChatApp() {
    const timeline = document.getElementById("chat-timeline");
    const inputEl = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");
    const resetBtn = document.getElementById("header-reset-btn");
    const staffBtn = document.getElementById("header-staff-btn");
    const hintBtn = document.getElementById("header-hint-btn");
    const subTitleEl = document.getElementById("header-status-sub");

    if (!timeline || !window.ARG_SCENARIO) return;
    const scenario = window.ARG_SCENARIO;
    let state = loadState();
    let isPlayingQueue = false;

    function scrollToBottom() {
      timeline.scrollTop = timeline.scrollHeight;
    }

    function updateHeaderStatus() {
      if (!subTitleEl) return;
      subTitleEl.textContent = `U-Talk 暗号化通信 ｜ 現在: ${state.currentScene}`;
    }

    // 1行のメッセージをDOMに追加
    function appendMessageDOM(item, instant) {
      if (item.effect === "date_3yrs_ago") {
        const badge = document.createElement("div");
        badge.className = "date-badge eerie-date";
        badge.textContent = "📅 2023年10月10日 (火) — 3年前の記録";
        timeline.appendChild(badge);
      }

      if (item.speaker === "system") {
        const sys = document.createElement("div");
        sys.className = "msg-system";
        sys.innerHTML = linkifyMessage(item.message);
        timeline.appendChild(sys);
        scrollToBottom();
        return;
      }

      if (item.speaker === "jammed") {
        const jammed = document.createElement("div");
        jammed.className = "msg-jammed";
        jammed.innerHTML = `⚡ <b>通信が阻害されました</b>（相手に届きませんでした）`;
        timeline.appendChild(jammed);
        scrollToBottom();
        return;
      }

      const row = document.createElement("div");
      row.className = `msg-row ${item.speaker} effect-${item.effect || "normal"}`;

      if (item.speaker !== "player") {
        const avatar = document.createElement("div");
        avatar.className = "msg-avatar";
        avatar.textContent = item.speaker === "hikane" ? "ヒ" : "？";
        row.appendChild(avatar);
      }

      const contentWrap = document.createElement("div");
      contentWrap.className = "msg-content-wrap";

      if (item.speaker !== "player") {
        const sender = document.createElement("div");
        sender.className = "msg-sender-name";
        sender.textContent = item.speaker === "hikane" ? "ヒカネ (音紡ぎ同好会)" : "不明なアカウント (ノイズ混入)";
        contentWrap.appendChild(sender);
      }

      const bubbleLine = document.createElement("div");
      bubbleLine.className = "msg-bubble-line";

      const timeSpan = document.createElement("span");
      timeSpan.className = "msg-timestamp";
      timeSpan.textContent = item.time || getCurrentTimeStr();

      const bubble = document.createElement("div");
      bubble.className = "msg-bubble";

      if (item.effect === "mirror") {
        const span = document.createElement("span");
        span.className = "mirror-text";
        span.innerHTML = linkifyMessage(item.message);
        const toggle = document.createElement("span");
        toggle.className = "mirror-toggle-hint";
        toggle.textContent = "🪞 [鏡に映して読む（反転を戻す）]";
        toggle.onclick = function () {
          if (span.style.transform === "none") {
            span.style.transform = "scaleX(-1)";
            toggle.textContent = "🪞 [鏡に映して読む（反転を戻す）]";
          } else {
            span.style.transform = "none";
            toggle.textContent = "🪞 [元の鏡文字に戻す]";
          }
        };
        bubble.appendChild(span);
        bubble.appendChild(toggle);
      } else if (item.effect === "vanish") {
        const textSpan = document.createElement("span");
        textSpan.className = "vanish-target";
        textSpan.innerHTML = linkifyMessage(item.message);
        bubble.appendChild(textSpan);

        if (!instant) {
          setTimeout(() => {
            textSpan.innerHTML = "▓▓▓ このメッセージは『うつしみ』により消去されました ▓▓▓";
            textSpan.className = "vanish-target vanished";
            const restoreBtn = document.createElement("button");
            restoreBtn.className = "restore-btn";
            restoreBtn.textContent = "[消去された痕跡を復元する]";
            restoreBtn.onclick = function () {
              textSpan.innerHTML = linkifyMessage(item.message);
              textSpan.className = "vanish-target";
              restoreBtn.remove();
            };
            bubble.appendChild(restoreBtn);
          }, 3500);
        }
      } else {
        const normalSpan = document.createElement("span");
        normalSpan.innerHTML = linkifyMessage(item.message);
        bubble.appendChild(normalSpan);
      }

      if (item.media && item.media.endsWith(".svg")) {
        const mediaCard = document.createElement("div");
        mediaCard.className = "media-card";
        mediaCard.innerHTML = renderMediaSVG(item.media);
        if (item.caption) {
          const cap = document.createElement("div");
          cap.className = "media-caption";
          cap.textContent = item.caption;
          mediaCard.appendChild(cap);
        }
        bubble.appendChild(mediaCard);
      }

      if (item.media && item.media.endsWith(".synth")) {
        const voiceBox = document.createElement("div");
        voiceBox.className = "voice-box";
        const playBtn = document.createElement("button");
        playBtn.className = "voice-play-btn";
        playBtn.textContent = "🔊 音声データを再生（合成音声）";
        playBtn.onclick = function () {
          playSynthVoice(item.media);
        };
        voiceBox.appendChild(playBtn);
        if (item.caption) {
          const vCap = document.createElement("div");
          vCap.className = "voice-caption";
          vCap.textContent = item.caption;
          voiceBox.appendChild(vCap);
        }
        bubble.appendChild(voiceBox);
      }

      if (item.speaker === "player") {
        bubbleLine.appendChild(timeSpan);
        bubbleLine.appendChild(bubble);
      } else {
        bubbleLine.appendChild(bubble);
        bubbleLine.appendChild(timeSpan);
      }

      contentWrap.appendChild(bubbleLine);
      row.appendChild(contentWrap);
      timeline.appendChild(row);
      scrollToBottom();
    }

    function checkAndRenderEnding(sceneId) {
      if (sceneId === "ending_bad") {
        const card = document.createElement("div");
        card.className = "ending-card bad";
        card.innerHTML = `
          <div style="font-weight:bold;color:#f43f5e;font-size:15px;margin-bottom:6px;">⚠️ BAD END: 現身の乗っ取り</div>
          <div style="font-size:12px;color:#cbd5e1;margin-bottom:10px;">偽の合言葉を唱えたことで、現在のヒカネもうつしみさんに上書きされてしまいました。</div>
          <button id="bad-rewind-btn" style="background:#be123c;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">⏪ 時間を巻き戻す（直前から再挑戦）</button>
        `;
        timeline.appendChild(card);
        const rewindBtn = document.getElementById("bad-rewind-btn");
        if (rewindBtn) {
          rewindBtn.onclick = function () {
            state.currentScene = "chap4_ritual";
            saveState(state);
            window.location.reload();
          };
        }
        scrollToBottom();
      } else if (sceneId === "ending_true") {
        const passCode = "UT-" + String(new Date().getMinutes()).padStart(2, "0") + "73";
        const card = document.createElement("div");
        card.className = "ending-card true";
        card.innerHTML = `
          <div style="font-weight:bold;color:#7dd3fc;font-size:15px;margin-bottom:6px;">🎉 CONGRATULATIONS! TRUE END</div>
          <div style="font-size:12px;color:#e0f2fe;margin-bottom:8px;">3年前のヒカネを救出し、すべての真相に到達しました！</div>
          <div style="background:#082f49;border:1px dashed #38bdf8;padding:8px;border-radius:6px;font-size:13px;">
            スタッフ提示用クリア証明コード：<b>${passCode}</b>
          </div>
        `;
        timeline.appendChild(card);
        scrollToBottom();
      }
    }

    // セリフ群を各行1秒の「入力中…」ディレイを挟んで順次再生
    async function playLineSequence(lines, instant) {
      if (!lines || lines.length === 0) return;
      isPlayingQueue = true;
      sendBtn.disabled = true;

      for (const rawLine of lines) {
        const line = Object.assign({}, rawLine);
        if (!line.time) line.time = getCurrentTimeStr();

        if (!instant) {
          const typing = document.createElement("div");
          typing.className = "typing-indicator";
          typing.innerHTML = `<span>${line.speaker === "mystery" ? "ノイズ混入中..." : "入力中..."}</span><span class="typing-dots"><span></span><span></span><span></span></span>`;
          timeline.appendChild(typing);
          scrollToBottom();

          // ご要望通り、セリフ間は1秒（1000ms）のディレイ
          const waitMs = line.effect === "long_typing" ? 1800 : line.speaker === "system" ? 300 : 1000;
          await new Promise(r => setTimeout(r, waitMs));
          typing.remove();
        }

        appendMessageDOM(line, instant);
        state.messageLog.push(line);
        saveState(state);
      }

      isPlayingQueue = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }

    // 章の導入メッセージ再生
    async function playSceneIntro(sceneId, instant) {
      const scene = scenario.scenes[sceneId];
      if (scene && scene.intro && scene.intro.length > 0) {
        await playLineSequence(scene.intro, instant);
      }
      checkAndRenderEnding(sceneId);
      updateHeaderStatus();
    }

    // 初回ロード時：メッセージ履歴の完全復元
    async function boot() {
      updateHeaderStatus();
      if (!state.messageLog || state.messageLog.length === 0) {
        state.messageLog = [];
        state.currentScene = "chap1_start";
        state.unlockedFlags = ["init", "chap1_start"];
        saveState(state);
        await playSceneIntro("chap1_start", false);
      } else {
        // 過去ログを保存時刻付きでそのまま一括復元
        for (const msg of state.messageLog) {
          appendMessageDOM(msg, true);
        }
        checkAndRenderEnding(state.currentScene);
      }
    }

    // トピック辞書キーワード送信処理
    async function handleSend() {
      if (isPlayingQueue) return;
      const rawText = inputEl.value.trim();
      if (!rawText) return;
      inputEl.value = "";

      // 運営・デバッグコマンド判定 (#staff00 / #debug)
      if (rawText.toLowerCase() === "#staff00" || rawText.toLowerCase() === "#debug") {
        openStaffModal();
        return;
      }

      const scene = scenario.scenes[state.currentScene];
      if (!scene) return;

      const norm = normalizeInput(rawText);

      // 現在の章のトピック辞書からキーワード一致を探索
      let matchedTopic = null;
      if (scene.topics) {
        for (const topic of scene.topics) {
          if (!topic.trigger_normalized) continue;
          for (const kw of topic.trigger_normalized) {
            if (norm.includes(kw) || kw.includes(norm)) {
              matchedTopic = topic;
              break;
            }
          }
          if (matchedTopic) break;
        }
      }

      // 【未一致の場合】プレイヤーの吹き出しは出さず、通信阻害エラーを表示
      if (!matchedTopic) {
        appendMessageDOM({ speaker: "jammed", time: getCurrentTimeStr() }, false);
        playSynthVoice("buzz_jammed");
        return;
      }

      // 【一致した場合】プレイヤーの吹き出しを表示して履歴保存
      const playerMsg = {
        speaker: "player",
        message: rawText,
        effect: "normal",
        time: getCurrentTimeStr()
      };
      appendMessageDOM(playerMsg, false);
      state.messageLog.push(playerMsg);
      saveState(state);

      // トピックのセリフ群を1秒ディレイで再生
      await playLineSequence(matchedTopic.lines, false);

      // 次の章への進行指定がある場合
      if (matchedTopic.next_scene) {
        const nextSid = matchedTopic.next_scene;
        state.currentScene = nextSid;
        if (!state.unlockedFlags.includes(nextSid)) {
          state.unlockedFlags.push(nextSid);
        }
        saveState(state);
        updateHeaderStatus();

        // 遷移先の章の導入セリフを自動再生
        await playSceneIntro(nextSid, false);
      }
    }

    // 💡 ヒントボタン押下処理
    if (hintBtn) {
      hintBtn.addEventListener("click", function () {
        const hints = (scenario.hints && scenario.hints[state.currentScene]) || [];
        const validHints = hints.filter(h => h && h.trim().length > 0);
        const hintBox = document.createElement("div");
        hintBox.className = "msg-hint";
        if (validHints.length > 0) {
          hintBox.innerHTML = `💡 <b>【ヒカネのヒント】</b><br>${validHints.map(h => linkifyMessage(h)).join("<br><br>")}`;
        } else {
          hintBox.innerHTML = `💡 <b>【ヒント】</b><br>探索リンクから各Webページを調べて、怪異の名前や合言葉の手がかりを探してみてください！`;
        }
        timeline.appendChild(hintBox);
        scrollToBottom();
      });
    }

    sendBtn.addEventListener("click", handleSend);
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (confirm("進行状況をリセットして最初からやり直しますか？")) {
          localStorage.removeItem(STORAGE_KEY);
          window.location.reload();
        }
      });
    }

    // 運営・デバッグメニュー
    function openStaffModal() {
      const modal = document.createElement("div");
      modal.className = "staff-modal";
      modal.innerHTML = `
        <div class="staff-modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <b style="color:#7dd3fc;font-size:14px;">🛠️ 運営・デバッグ支援メニュー (#staff00)</b>
            <button id="staff-close-btn" style="background:#334155;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">✕ 閉じる</button>
          </div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:10px;">
            現在の章ID: <b style="color:#f8fafc">${state.currentScene}</b><br>
            解放済みフラグ: <b style="color:#f8fafc">${state.unlockedFlags.join(", ")}</b>
          </div>
          <div style="font-size:12px;font-weight:bold;color:#cbd5e1;margin-bottom:6px;">⏭️ 章ジャンプ（テスト用）:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
            <button class="jump-btn" data-jump="chap1_start">第1章: 導入 (正解: コダマ)</button>
            <button class="jump-btn" data-jump="chap2_urban">第2章: 怪異名 (正解: うつしみさん)</button>
            <button class="jump-btn" data-jump="chap3_truth">第3章: 時間差 (正解: 3年前)</button>
            <button class="jump-btn" data-jump="chap4_ritual">第4章: 儀式 (正解: ヨアケノウタ)</button>
            <button class="jump-btn" data-jump="ending_bad">BAD END確認</button>
            <button class="jump-btn" data-jump="ending_true">TRUE END確認</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById("staff-close-btn").onclick = () => modal.remove();
      modal.querySelectorAll(".jump-btn").forEach(btn => {
        btn.onclick = function () {
          const sid = this.getAttribute("data-jump");
          state.currentScene = sid;
          state.messageLog = [];
          if (!state.unlockedFlags.includes(sid)) state.unlockedFlags.push(sid);
          saveState(state);
          modal.remove();
          window.location.reload();
        };
      });
    }

    if (staffBtn) {
      staffBtn.addEventListener("click", openStaffModal);
    }

    boot();
  }

  // ===== 探索用Webページ（club, urban, bbs）の進行度連動描画 =====
  function initWebPageRendering() {
    const listEl = document.getElementById("article-list");
    if (!listEl || !window.ARG_SCENARIO) return;

    const pageId = document.body.getAttribute("data-page-id");
    if (!pageId) return;

    const scenario = window.ARG_SCENARIO;
    const articles = (scenario.pages && scenario.pages[pageId]) || [];
    const state = loadState();

    listEl.innerHTML = "";

    articles.forEach(art => {
      const isUnlocked = art.unlock_flag === "init" || state.unlockedFlags.includes(art.unlock_flag);
      if (!isUnlocked) return;

      const card = document.createElement("article");
      card.className = "content-card";

      card.innerHTML = `
        <div class="card-meta">
          <span>📅 ${art.date}</span>
          ${art.author ? `<span>✍️ ${art.author}</span>` : ""}
        </div>
        <h2 class="card-title">${art.title}</h2>
        <div class="card-body">
          ${art.body}
        </div>
      `;

      if (art.image && art.image.endsWith(".svg")) {
        const imgWrap = document.createElement("div");
        imgWrap.className = "card-media-wrap";
        imgWrap.innerHTML = renderMediaSVG(art.image);
        card.appendChild(imgWrap);
      }

      listEl.appendChild(card);
    });

    // BBSのタップ（長押し）で浮き出る隠し文字ギミックのイベント付与
    document.querySelectorAll(".secret-spoiler").forEach(el => {
      el.addEventListener("click", function () {
        this.classList.toggle("revealed");
      });
    });
  }

  // DOMContentLoaded で起動
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initChatApp();
      initWebPageRendering();
    });
  } else {
    initChatApp();
    initWebPageRendering();
  }
})();
