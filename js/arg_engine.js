/**
 * 文化祭ARG コアエンジン (arg_engine.js)
 * - チャット進行・6種ホラー演出・表記ゆれ吸収・3回ミスヒント・LocalStorage共有
 * - 探索用Webページの進行度連動レンダリング
 * - #staff00 運営・デバッグメニュー
 */
(function () {
  const STORAGE_KEY = "bunkasai_arg_state_v1";

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
      activeBranchScene: "chap1_start",
      unlockedFlags: ["init", "chap1_start"],
      missCount: 0,
      history: [] // 再生済みシーンID順序
    };
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("LocalStorage保存失敗:", e);
    }
  }

  function resetState() {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
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
    if (mediaName === "club_photo_normal.svg") {
      return `<svg viewBox="0 0 360 160" width="100%" style="display:block;background:#1e293b">
        <text x="180" y="26" fill="#94a3b8" font-size="11" text-anchor="middle">📷 2023年 文化祭 音紡ぎ同好会 集合写真</text>
        <circle cx="90" cy="80" r="18" fill="#475569"/><text x="90" y="115" fill="#cbd5e1" font-size="10" text-anchor="middle">先輩A</text>
        <circle cx="180" cy="80" r="18" fill="#475569"/><text x="180" y="115" fill="#cbd5e1" font-size="10" text-anchor="middle">先輩B</text>
        <circle cx="270" cy="80" r="18" fill="#38bdf8"/><text x="270" y="115" fill="#7dd3fc" font-size="10" text-anchor="middle">ヒカネ(1年)</text>
      </svg>`;
    }
    if (mediaName === "club_photo_eerie.svg") {
      return `<svg viewBox="0 0 360 170" width="100%" style="display:block;background:#1a0f1c">
        <text x="180" y="24" fill="#fda4af" font-size="11" text-anchor="middle">⚠️ 2023年 集合写真（Web上の画像が変化しています）</text>
        <circle cx="80" cy="75" r="15" fill="#334155" opacity="0.4"/>
        <circle cx="155" cy="75" r="15" fill="#334155" opacity="0.4"/>
        <circle cx="255" cy="92" r="38" fill="#be123c" stroke="#fda4af" stroke-width="2"/>
        <circle cx="243" cy="86" r="4" fill="#fff"/><circle cx="267" cy="86" r="4" fill="#fff"/>
        <text x="255" y="148" fill="#fecdd3" font-size="11" font-weight="bold" text-anchor="middle">ヒカネだけが画面の手前に近づいている</text>
      </svg>`;
    }
    return `<img src="assets/${mediaName}" alt="添付画像" style="max-width:100%;display:block;">`;
  }

  // Web Audio API によるボカロ・合成音声風の音響合成（外部音声ファイル不要で動作）
  function playSynthVoice(type) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === "voice_warning.synth" || type === "voice_bad.synth") {
      // 不気味な合成音声風のフォルマント・コーラス音
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
      // 3年前のチャイム音（学校のチャイム風4音）
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
      // トゥルーエンドの澄んだ歌声シンセ風アルペジオ
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

    if (!timeline || !window.ARG_SCENARIO) return;
    const scenario = window.ARG_SCENARIO;
    let state = loadState();
    let isPlayingQueue = false;

    function scrollToBottom() {
      timeline.scrollTop = timeline.scrollHeight;
    }

    // 1行のメッセージをDOMに追加
    function appendMessageDOM(item, instant) {
      // 演出: 3年前の日付バッジ
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

      const row = document.createElement("div");
      row.className = `msg-row ${item.speaker} effect-${item.effect || "normal"}`;

      const avatar = document.createElement("div");
      avatar.className = "msg-avatar";
      avatar.textContent = item.speaker === "hikane" ? "ヒ" : item.speaker === "mystery" ? "？" : "あ";

      const contentWrap = document.createElement("div");
      contentWrap.className = "msg-content-wrap";

      if (item.speaker !== "player") {
        const sender = document.createElement("div");
        sender.className = "msg-sender-name";
        sender.textContent = item.speaker === "hikane" ? "ヒカネ (音紡ぎ同好会)" : "不明なアカウント (ノイズ混入)";
        contentWrap.appendChild(sender);
      }

      const bubble = document.createElement("div");
      bubble.className = "msg-bubble";

      // 演出: 左右反転 (mirror)
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
      } else {
        bubble.innerHTML = linkifyMessage(item.message);
      }

      // 演出: 数秒後に消去 (vanish)
      if (item.effect === "vanish") {
        const originalHTML = bubble.innerHTML;
        const delay = instant ? 800 : 4200;
        setTimeout(() => {
          bubble.classList.add("vanished-msg");
          bubble.innerHTML = `▓▓▓ このメッセージは『うつしみ』により消去されました ▓▓▓ <span class="mirror-toggle-hint" style="color:#fda4af">[痕跡を復元する]</span>`;
          bubble.onclick = function () {
            bubble.innerHTML = originalHTML;
            bubble.classList.remove("vanished-msg");
          };
        }, delay);
      }

      // メディア添付（画像または合成音声）
      if (item.media) {
        if (item.media.endsWith(".synth") || item.media.endsWith(".mp3") || item.media.endsWith(".wav")) {
          const audioBox = document.createElement("div");
          audioBox.className = "audio-player-box";
          const btn = document.createElement("button");
          btn.className = "audio-play-btn";
          btn.textContent = "🔊 音声データを再生（合成音声）";
          btn.onclick = function () {
            playSynthVoice(item.media);
          };
          audioBox.appendChild(btn);
          if (item.caption) {
            const sub = document.createElement("div");
            sub.className = "audio-subtitle";
            sub.textContent = "字幕: " + item.caption;
            audioBox.appendChild(sub);
          }
          bubble.appendChild(audioBox);
        } else {
          const mediaBox = document.createElement("div");
          mediaBox.className = "media-box";
          mediaBox.innerHTML = renderMediaSVG(item.media);
          if (item.caption) {
            const cap = document.createElement("div");
            cap.className = "media-caption";
            cap.textContent = item.caption;
            mediaBox.appendChild(cap);
          }
          bubble.appendChild(mediaBox);
        }
      }

      contentWrap.appendChild(bubble);

      const meta = document.createElement("div");
      meta.className = "msg-meta";
      meta.textContent = item.speaker === "player" ? "既読" : item.effect === "date_3yrs_ago" ? "2023/10/10" : "たった今";

      if (item.speaker === "player") {
        row.appendChild(contentWrap);
        row.appendChild(meta);
      } else {
        row.appendChild(avatar);
        row.appendChild(contentWrap);
        row.appendChild(meta);
      }

      timeline.appendChild(row);
      scrollToBottom();
    }

    // エンディング到達時の特別UI表示
    function checkAndRenderEnding(sceneId) {
      if (sceneId === "ending_bad") {
        const card = document.createElement("div");
        card.className = "ending-card bad";
        card.innerHTML = `
          <div style="font-weight:bold;color:#fda4af;margin-bottom:6px;">【BAD END：現身の乗っ取り】</div>
          <div style="font-size:12px;color:#fecdd3;">うつしみさんが仕込んだ偽の合言葉により、現在のヒカネまで上書きされてしまいました。</div>
          <button class="rewind-btn" id="rewind-btn">⏪ 時間を巻き戻す（最後の儀式からやり直す）</button>
        `;
        timeline.appendChild(card);
        const rwBtn = card.querySelector("#rewind-btn");
        rwBtn.onclick = function () {
          state.currentScene = "chap4_ritual";
          state.activeBranchScene = "chap4_ritual";
          state.missCount = 0;
          state.history = state.history.filter(s => s !== "ending_bad");
          saveState(state);
          window.location.reload();
        };
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

    // シーン内のメッセージ群を順番にアニメーション再生
    async function playSceneMessages(sceneId, instant) {
      const lines = scenario.scenes[sceneId] || [];
      isPlayingQueue = true;
      sendBtn.disabled = true;

      for (const item of lines) {
        if (!instant) {
          const typing = document.createElement("div");
          typing.className = "typing-indicator";
          typing.innerHTML = `<span>${item.speaker === "mystery" ? "ノイズ混入中" : "入力中"}</span><span class="typing-dots"><span></span><span></span><span></span></span>`;
          timeline.appendChild(typing);
          scrollToBottom();

          const waitMs = item.effect === "long_typing" ? 1600 : item.speaker === "system" ? 300 : 650;
          await new Promise(r => setTimeout(r, waitMs));
          typing.remove();
        }
        appendMessageDOM(item, instant);
      }

      checkAndRenderEnding(sceneId);
      isPlayingQueue = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }

    // 初回ロード時：履歴の復元再生
    async function restoreOrStart() {
      if (!state.history || state.history.length === 0) {
        state.history = ["chap1_start"];
        state.currentScene = "chap1_start";
        state.activeBranchScene = "chap1_start";
        saveState(state);
        await playSceneMessages("chap1_start", false);
      } else {
        for (const sid of state.history) {
          await playSceneMessages(sid, true);
        }
      }
    }

    // キーワード送信処理
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

      // プレイヤーの吹き出しを表示
      appendMessageDOM({ speaker: "player", message: rawText, effect: "normal" }, true);

      const branchKey = state.activeBranchScene || state.currentScene;
      const branch = scenario.branches[branchKey];
      if (!branch) {
        const info = document.createElement("div");
        info.className = "msg-system";
        info.textContent = "（すべての通信が完了しています。最初から遊ぶ場合は右上の『初期化』を押してください）";
        timeline.appendChild(info);
        scrollToBottom();
        return;
      }

      const norm = normalizeInput(rawText);

      // 1. 正解キーワード一致判定
      if (branch.true_normalized.includes(norm)) {
        state.missCount = 0;
        const nextSid = branch.next_scene;
        state.currentScene = nextSid;
        if (scenario.branches[nextSid]) {
          state.activeBranchScene = nextSid;
        } else {
          state.activeBranchScene = nextSid;
        }
        if (!state.unlockedFlags.includes(nextSid)) {
          state.unlockedFlags.push(nextSid);
        }
        state.history.push(nextSid);
        saveState(state);
        await playSceneMessages(nextSid, false);
        return;
      }

      // 2. うつしみさんの偽キーワード一致判定
      if (branch.fake_normalized && branch.fake_normalized.includes(norm)) {
        state.missCount = 0;
        const fakeNext = branch.fake_next_scene;
        state.currentScene = fakeNext;
        if (!state.unlockedFlags.includes(fakeNext)) {
          state.unlockedFlags.push(fakeNext);
        }
        state.history.push(fakeNext);
        // 遠回りシーンにもし専用branchがあれば更新、なければ元のbranchを維持
        if (scenario.branches[fakeNext]) {
          state.activeBranchScene = fakeNext;
        }
        saveState(state);
        await playSceneMessages(fakeNext, false);
        return;
      }

      // 3. 不一致：「通信が阻害されました」＋3回ごとの独り言ヒント
      state.missCount = (state.missCount || 0) + 1;
      saveState(state);

      const jammed = document.createElement("div");
      jammed.className = "msg-jammed";
      jammed.innerHTML = `⚡ <b>通信が阻害されました</b>（キーワード『${rawText.replace(/</g, "&lt;")}』は一致しません / ミス ${state.missCount}回目）`;
      timeline.appendChild(jammed);

      // 3回・6回・9回ミスで段階的ヒント（デモで試しやすいよう1回目でも小さく案内、3の倍数で本ヒント表示）
      if (state.missCount % 3 === 0) {
        const hintIdx = Math.min(Math.floor(state.missCount / 3) - 1, 2);
        const hintText = branch.hints && branch.hints[hintIdx];
        if (hintText) {
          const hintBox = document.createElement("div");
          hintBox.className = "msg-hint";
          hintBox.innerHTML = `💡 <b>【ヒカネの独り言ヒント（段階 ${hintIdx + 1}/3）】</b><br>${linkifyMessage(hintText)}`;
          timeline.appendChild(hintBox);
        }
      }
      scrollToBottom();
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
          resetState();
        }
      });
    }

    if (staffBtn) {
      staffBtn.addEventListener("click", openStaffModal);
    }

    // 運営・デバッグモーダル (#staff00) の制御
    function openStaffModal() {
      const modal = document.getElementById("staff-modal");
      const statusBox = document.getElementById("staff-status-box");
      if (!modal) return;
      const branch = scenario.branches[state.activeBranchScene];
      statusBox.innerHTML = `
        <div>現在の場面ID: <b>${state.currentScene}</b></div>
        <div>入力待ち分岐: <b>${state.activeBranchScene}</b>（現在のミス回数: ${state.missCount}回）</div>
        <div>解放済みフラグ: <code>${state.unlockedFlags.join(", ")}</code></div>
        <div style="margin-top:6px;color:#fde68a;">👉 現在の正解例: <b>${branch ? branch.true_sample : "（エンディング到達済）"}</b></div>
        <div style="color:#fda4af;">👉 現在の偽答え例: <b>${branch && branch.fake_sample ? branch.fake_sample : "なし"}</b></div>
      `;
      modal.classList.add("open");
    }

    window.ARG_JUMP_SCENE = async function (targetSceneId) {
      const modal = document.getElementById("staff-modal");
      if (modal) modal.classList.remove("open");
      const order = ["init", "chap1_start", "chap2_urban", "chap3_truth", "chap4_ritual", targetSceneId];
      state.unlockedFlags = Array.from(new Set(order));
      state.currentScene = targetSceneId;
      state.activeBranchScene = scenario.branches[targetSceneId] ? targetSceneId : "chap4_ritual";
      state.missCount = 0;
      state.history = [targetSceneId];
      saveState(state);
      timeline.innerHTML = "";
      await playSceneMessages(targetSceneId, false);
    };

    window.ARG_FORCE_HINT = function () {
      const modal = document.getElementById("staff-modal");
      if (modal) modal.classList.remove("open");
      const branch = scenario.branches[state.activeBranchScene];
      if (!branch || !branch.hints) return;
      branch.hints.forEach((h, i) => {
        if (h) {
          const hintBox = document.createElement("div");
          hintBox.className = "msg-hint";
          hintBox.innerHTML = `💡 <b>【ヒント ${i + 1}/3】</b><br>${linkifyMessage(h)}`;
          timeline.appendChild(hintBox);
        }
      });
      scrollToBottom();
    };

    window.ARG_RESET = resetState;

    restoreOrStart();
  }

  // ===== 探索用Webページの初期化 =====
  function initWebPage(pageId) {
    const container = document.getElementById("web-Dynamic-content");
    const flagBadge = document.getElementById("web-flag-status");
    if (!container || !window.ARG_SCENARIO) return;

    const state = loadState();
    const articles = window.ARG_SCENARIO.pages[pageId] || [];

    if (flagBadge) {
      flagBadge.textContent = "現在の調査進行度: " + state.unlockedFlags[state.unlockedFlags.length - 1];
    }

    // 解放済みフラグに合致する記事をすべて表示（新しい情報が上に来るか、時系列で並ぶ）
    const visibleArticles = articles.filter(a => state.unlockedFlags.includes(a.unlock_flag));

    container.innerHTML = "";
    visibleArticles.forEach(art => {
      const card = document.createElement("article");
      card.className = "web-article-card";
      let imgHTML = "";
      if (art.image) {
        imgHTML = `<div style="margin:12px 0;border-radius:8px;overflow:hidden;border:1px solid #334155;">${renderMediaSVG(art.image)}</div>`;
      }
      card.innerHTML = `
        <div class="web-article-meta">📅 ${art.date} ｜ ✍️ ${art.author}</div>
        <h2 class="web-article-title">${art.title}</h2>
        ${imgHTML}
        <div class="web-article-body">${art.body}</div>
      `;
      container.appendChild(card);
    });
  }

  window.ARG_ENGINE = {
    initChatApp,
    initWebPage,
    loadState,
    resetState
  };
})();
