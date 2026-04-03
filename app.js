(() =>
{
    const APP_CONFIG = (() =>
    {
        const raw = window.EGF_READER_CONFIG || {};

        const allowedLangs = new Set(["en", "fr", "es", "pt", "zh", "ar", "hi", "ur", "ru", "auto"]);
        const allowedThemes = new Set(["dark", "light", "system"]);

        const preloadedEgfUrl =
            (typeof raw.preloadedEgfUrl === "string" && raw.preloadedEgfUrl.trim())
                ? raw.preloadedEgfUrl.trim()
                : "./game.egf";

        let defaultLang =
            (typeof raw.defaultLang === "string" && raw.defaultLang.trim())
                ? raw.defaultLang.trim().toLowerCase()
                : "en";

        if (!allowedLangs.has(defaultLang))
        {
            console.warn(
                `[EGF Reader] defaultLang="${defaultLang}" is invalid. ` +
                `Allowed values: ${Array.from(allowedLangs).join(", ")}. Fallback: "en".`
            );
            defaultLang = "en";
        }

        let defaultTheme =
            (typeof raw.defaultTheme === "string" && raw.defaultTheme.trim())
            ? raw.defaultTheme.trim().toLowerCase()
            : "system";

        if (!allowedThemes.has(defaultTheme))
        {
            console.warn(
                `[EGF Reader] defaultTheme="${defaultTheme}" is invalid. ` +
                `Allowed values: ${Array.from(allowedThemes).join(", ")}. Fallback: "system".`
            );
            defaultTheme = "system";
        }

        return {
            preloadedEgfUrl,
            defaultLang,
            defaultTheme
        };
    })();

    const PRELOADED_EGF_URL = APP_CONFIG.preloadedEgfUrl;

    let currentLang         = APP_CONFIG.defaultLang;
    let currentPackageFile  = null;

    const $ = (id) => document.getElementById(id);

    const setBtnLabel = (btn, icon, label) =>
    {
        const iconEl = btn.querySelector(".btnIcon");
        const labelEl = btn.querySelector(".btnLabel");

        if (iconEl) iconEl.textContent      = icon;
        if (labelEl) labelEl.textContent    = label;
    };

    const rolePill = $("rolePill");
    const roleProgressText = $("roleProgressText");
    const roleBarFill = $("roleBarFill");

    const poweredBy = $("poweredBy");


    // About cover nodes

    const aboutCoverWrap = $("aboutCoverWrap");
    const aboutCover = $("aboutCover");

    const btnAbout = $("btnAbout");
    const aboutModal = $("aboutModal");
    const aboutBackdrop = $("aboutBackdrop");
    const btnCloseAbout = $("btnCloseAbout");

    const btnSettings = $("btnSettings");
    const settingsModal = $("settingsModal");
    const settingsBackdrop = $("settingsBackdrop");
    const btnCloseSettings = $("btnCloseSettings");

    const btnReset = $("btnReset");
    const btnDownloadEgf = $("btnDownloadEgf");

    const btnPause = $("btnPause");
    const btnScore = $("btnScore");

    const scoreModal = $("scoreModal");
    const scoreBackdrop = $("scoreBackdrop");
    const btnCloseScore = $("btnCloseScore");

    const btnResumeOverlay = $("btnResumeOverlay");
    const pauseOverlay = $("pauseOverlay");
    const sceneWrap = $("sceneWrap");
    const actionBar = $("actionBar");

    const headerEl = document.querySelector("header");
    const headerActionsHost = document.querySelector(".headerActions");
    const mobileHeaderMq = window.matchMedia("(max-width: 1024px)");

    function syncResponsiveHeader()
    {
        if (!headerEl || !actionBar || !headerActionsHost)
        {
            return;
        }

        if (mobileHeaderMq.matches)
        {
            // On mobile: move the action bar out of the header.

            if (actionBar.parentElement !== document.body)
            {
                document.body.appendChild(actionBar);
            }
        }
        else
        {
            // On desktop: move the action bar back into the header
            // and show the header again.

            if (actionBar.parentElement !== headerActionsHost)
            {
                headerActionsHost.appendChild(actionBar);
            }
        }
    }

    const warningsBox = $("warnings");

    const kvVer = $("kvVer");
    const kvTitle = $("kvTitle");
    const kvCreator = $("kvCreator");
    const kvDesc = $("kvDesc");
    const kvDate = $("kvDate");
    const kvModified = $("kvModified");
    const kvCurrentScene = $("kvCurrentScene");
    const kvCurrentRole = $("kvCurrentRole");
    const kvCurrentSceneId = $("kvCurrentSceneId");

    const kvWrong = $("kvWrong");

    const sceneName = $("sceneName");
    const sceneSub = $("sceneSub");
    const sceneContent = $("sceneContent");
    const sceneFooter = $("sceneFooter");
    const progressBox = $("progressBox");
    const progressText = $("progressText");
    const barFill = $("barFill");

    // Settings controls live in settings modal now

    const bgMute = $("bgMute");
    const fgMute = $("fgMute");
    const bgVol = $("bgVol");
    const fgVol = $("fgVol");
    const bgVolPct = $("bgVolPct");
    const fgVolPct = $("fgVolPct");

    const langSelect = $("langSelect");
    const langLabel = $("langLabel");

    const scoreProgressPct = $("scoreProgressPct");

    // Pause state

    let isPaused = false;
    let pendingNav = null;
    let pauseSnapshot = null;

    let coverObjectUrl = null;

    let faviconObjectUrl = null;

    const faviconEl = $("appFavicon") || (() =>
    {
        const link = document.createElement("link");
        link.id = "appFavicon";
        link.rel = "icon";
        document.head.appendChild(link);
        return link;
    })();

    const defaultFaviconHref = faviconEl?.getAttribute("href") || "";
    const defaultFaviconType = faviconEl?.getAttribute("type") || "image/png";

    // Track blob URLs created for scene resources (images/audio/video/etc.)

    let sceneObjectUrls = new Set();

    function trackSceneUrl(url)
    {
        if (!url)
        {
            return;
        }

        if (String(url).startsWith("blob:"))
        {
            sceneObjectUrls.add(url);
        }
    }

    // Revoke ALL tracked scene blob URLs (except cover)

    function revokeSceneObjectUrls()
    {
        for (const url of sceneObjectUrls)
        {
            if (!url)
            {
                continue;
            }

            if (
                (coverObjectUrl && url === coverObjectUrl) ||
                (faviconObjectUrl && url === faviconObjectUrl)
            )
            {
                continue;
            }

            try
            {
                URL.revokeObjectURL(url);
            }
            catch
            {

            }
        }

        sceneObjectUrls.clear();
    }

    function clamp01(x)
    {
        return Math.max(0, Math.min(1, x));
    }

    // =========================
    // MOBILE AUTOPLAY UNLOCK
    // =========================

    let audioUnlocked = false;

    async function unlockAudio()
    {
        if (audioUnlocked) return;

        // iOS/Chrome: try to "consume" a user gesture
        // by playing a very short muted audio.

        const a = document.createElement("audio");
        a.muted = true;
        a.playsInline = true;

        // Small muted WAV (very short) as a data URI
        // (avoids a network fetch and works offline)

        a.src =
            "data:audio/wav;base64," +
            "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

        try
        {
            // Some browsers require volume = 0 rather than muted.

            a.volume = 0;
            await a.play();
            a.pause();
            a.removeAttribute("src");
            a.load();
            audioUnlocked = true;
        }
        catch
        {
            // If it fails, we'll try again on the next user gesture.
        }
    }

    // Bonus: retry on the first real user gesture (tap/click/keyboard).

    function installAudioUnlockListeners()
    {
        const once = async () =>
        {
            const wasUnlocked = audioUnlocked;

            await unlockAudio();

            if (audioUnlocked)
            {
                if (!wasUnlocked)
                {
                    await retryCurrentMainMedia();
                }

                window.removeEventListener("pointerdown", once, true);
                window.removeEventListener("touchend", once, true);
                window.removeEventListener("keydown", once, true);
            }
        };

        window.addEventListener("pointerdown", once, true);
        window.addEventListener("touchend", once, true);
        window.addEventListener("keydown", once, true);
    }

    installAudioUnlockListeners();

    // Helper: play "safe" (won't break if it gets blocked).

    async function playSafe(mediaEl)
    {
        if (!mediaEl || isPaused) return false;

        try
        {
            await mediaEl.play();
            return true;
        }
        catch
        {
            return false;
        }
    }

    async function retryCurrentMainMedia()
    {
        if (isPaused) return false;
        if (!audioState.main) return false;

        const ok = await playSafe(audioState.main);

        applyForegroundMuteIfNeeded();
        applyBgDuckIfNeeded();

        return ok;
    }

    // Audio Manager

    const audioState = {
        bg: null,
        bgItemId: null,
        bgBaseVolume: 0.55,
        bgDuckVolume: 0.20,
        bgUserVolume: 1.0,
        bgPausedForPrimary: false,

        fgUserVolume: 1.0,

        fg: [],
        main: null,
        mainIsPrimary: false
    };

    function updateVolumeLabels()
    {
        bgVolPct.textContent = `${bgVol.value}%`;
        fgVolPct.textContent = `${fgVol.value}%`;
    }

    function setWarnings(lines, isWarn = true)
    {
        if (!lines || !lines.length)
        {
            warningsBox.style.display = "none";
            warningsBox.textContent = "";
            warningsBox.classList.remove("warn");

            return;
        }

        warningsBox.style.display = "block";
        warningsBox.textContent = lines.join("\n");

        if (isWarn)
        {
            warningsBox.classList.add("warn");
        }

        else
        {
            warningsBox.classList.remove("warn");
        }
    }

    function stopAndRevoke(el)
    {
        if (!el)
        {
            return;
        }

        try
        {
            el.pause();
        }

        catch
        {

        }

        try
        {
            if (el.src && el.src.startsWith("blob:"))
            {
                URL.revokeObjectURL(el.src);
            }
        }
        catch
        {

        }

        try
        {
            if (el.src && el.src.startsWith("blob:"))
            {
                sceneObjectUrls.delete(el.src);
            }
        }
        catch
        {

        }
    }

    // Revoke cover URL cleanly

    function revokeCoverUrl()
    {
        try
        {
            if (coverObjectUrl && String(coverObjectUrl).startsWith("blob:"))
            {
                URL.revokeObjectURL(coverObjectUrl);
            }
        }
        catch
        {

        }
        coverObjectUrl = null;
    }

    function revokeFaviconUrl()
    {
        try
        {
            if (faviconObjectUrl && String(faviconObjectUrl).startsWith("blob:"))
            {
                URL.revokeObjectURL(faviconObjectUrl);
            }
        }
        catch
        {

        }

        if (faviconObjectUrl)
        {
            sceneObjectUrls.delete(faviconObjectUrl);
        }

        faviconObjectUrl = null;
    }

    function setFaviconUrl(url, mimeType = "image/png")
    {
        const next = url || null;

        if (faviconObjectUrl && faviconObjectUrl !== next)
        {
            try
            {
                if (String(faviconObjectUrl).startsWith("blob:"))
                {
                    URL.revokeObjectURL(faviconObjectUrl);
                }
            }
            catch
            {

            }
        }

        if (faviconObjectUrl)
        {
            sceneObjectUrls.delete(faviconObjectUrl);
        }

        if (next)
        {
            sceneObjectUrls.delete(next);
        }

        faviconObjectUrl = next;

        if (!faviconEl)
        {
            return;
        }

        if (!faviconObjectUrl)
        {
            if (defaultFaviconHref)
            {
                faviconEl.href = defaultFaviconHref;
            }

            faviconEl.type = defaultFaviconType;
            faviconEl.rel = "icon";
            return;
        }

        faviconEl.href = faviconObjectUrl;
        faviconEl.type = mimeType || "image/png";
        faviconEl.rel = "icon";
    }

    function setCoverUrl(url, titleForAlt = "")
    {
        const next = url || null;

        if (coverObjectUrl && coverObjectUrl !== next)
        {
            try
            {
                if (String(coverObjectUrl).startsWith("blob:"))
                {
                    URL.revokeObjectURL(coverObjectUrl);
                }
            }
            catch
            {}
        }

        // The cover should never be in the "scene" tracking

        if (coverObjectUrl)
        {
            sceneObjectUrls.delete(coverObjectUrl);
        }

        if (next)
        {
            sceneObjectUrls.delete(next);
        }

        coverObjectUrl = next;

        // UI

        if (!coverObjectUrl)
        {
            aboutCoverWrap.style.display = "none";
            aboutCover.removeAttribute("src");
            aboutCover.alt = "EGF cover";

            return;
        }

        const t = String(titleForAlt || "").trim();

        aboutCover.src = coverObjectUrl;
        aboutCover.alt = t ? `Cover: ${t}` : "EGF cover";
        aboutCoverWrap.style.display = "flex";
    }

    function stopAllForegroundAudio()
    {
        for (const x of audioState.fg)
        {
            stopAndRevoke(x.el);
        }
        audioState.fg = [];
    }

    function stopMainMedia()
    {
        if (audioState.main)
        {
            stopAndRevoke(audioState.main);
        }

        audioState.main = null;
        audioState.mainIsPrimary = false;
    }

    function isAudioEl(el)
    {
        return !!el && (el instanceof HTMLAudioElement || el.tagName === "AUDIO");
    }

    function applyForegroundMuteIfNeeded()
    {
        const mute = !!fgMute.checked;
        const mul = clamp01(audioState.fgUserVolume);

        for (const x of audioState.fg)
        {
            if (!x?.el)
            {
                continue;
            }

            const base = (x.baseVol ?? 1.0);
            x.el.volume = mute ? 0 : clamp01(base * mul);
        }

        if (audioState.main && isAudioEl(audioState.main))
        {
            audioState.main.volume = mute ? 0 : mul;
        }

        sceneWrap.querySelectorAll("audio").forEach(a =>
        {
            try
            {
                a.volume = mute ? 0 : mul;
            }
            catch
            {}
        });
    }

    function applyBgDuckIfNeeded()
    {
        const bg = audioState.bg;

        if (!bg)
        {
            return;
        }

        if (isPaused)
        {
            try
            {
                bg.pause();
            }
            catch
            {}

            return;
        }

        const anyForegroundPlaying =
            (audioState.main && !audioState.main.paused) ||
            audioState.fg.some(x => x.el && !x.el.paused);

        if (bgMute.checked)
        {
            bg.volume = 0;

            return;
        }

        if (audioState.mainIsPrimary && audioState.main && !audioState.main.paused)
        {
            if (!bg.paused)
            {
                audioState.bgPausedForPrimary = true;
                bg.pause();
            }

            return;
        }

        if (audioState.bgPausedForPrimary && bg.paused)
        {
            audioState.bgPausedForPrimary = false;
            try
            {
                bg.play();
            }
            catch
            {

            }
        }

        const internal = anyForegroundPlaying ? audioState.bgDuckVolume : audioState.bgBaseVolume;
        bg.volume = clamp01(internal * clamp01(audioState.bgUserVolume));
    }

    function attachMainMedia(mediaEl,
    {
        primary
    } = {
        primary: false
    })
    {
        stopMainMedia();

        audioState.main = mediaEl;
        audioState.mainIsPrimary = !!primary;

        applyForegroundMuteIfNeeded();

        const onPlay = () =>
        {
            for (const x of audioState.fg)
            {
                try
                {
                    if (!x.el.paused)
                    {
                        x.el.pause();
                    }
                }
                catch
                {

                }
            }
            applyBgDuckIfNeeded();
        };
        const onPauseOrEnd = () =>
        {
            if (isPaused) return; // Nothing should resume from the global pause

            for (const x of audioState.fg)
            {
                try
                {
                    if (x.el && x.el.currentTime < (x.el.duration || Infinity) && x.el.paused)
                    {
                        x.el.play();
                    }
                }
                catch
                {

                }
            }
            applyBgDuckIfNeeded();
        };

        mediaEl.addEventListener("play", onPlay);
        mediaEl.addEventListener("pause", onPauseOrEnd);
        mediaEl.addEventListener("ended", onPauseOrEnd);

        applyBgDuckIfNeeded();
    }

    // EGF package state

    let zip = null;
    let corePath = null;
    let coreDir = "";
    let egfVersion = "1.1";
    let isCompat10 = false;
    let manifestById = new Map();
    let settingsRefs = new Set();
    let settingsRefCounts = new Map();
    let sequence = [];
    let sceneIndexById = new Map();

    // Metadata

    let meta = {
        title: "—",
        creator: "—",
        description: "—",
        date: "—",
        modified: "—"
    };

    // Gameplay state

    const gameState = {
        currentIndex: 0,
        sessionActive: false,
        wrongCount: 0,
        maxWrong: 5,
        idGameTitle: null,
        idCongratulations: null,
        idGameOver: null,
        idCredits: null,
        bgItems: [],
        fgItemsBySceneId: new Map(),
        coverItem: null,

        // Progression (gameplay session)

        gameplayStartIdx: 0,
        gameplayEndIdx: 0,
        lastGameplayPct: 0
    };

    function escapeHtml(s)
    {
        return String(s).replace(/[&<>"']/g, c => (
        {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        } [c]));
    }

    // =========================
    // MIME CONFORMANCE (EGF 1.1)
    // =========================

    // Manifest-level role -> allowed media-types (EGF 1.1 normative)

    const ROLE_MIME_RULES_MANIFEST = {
        // Core normal roles (direct resources)

        text_simple: ["text/plain"],
        image_simple: ["image/png", "image/jpeg"],
        audio_simple: ["audio/wav", "audio/ogg", "audio/mpeg"],
        video_simple: ["video/mp4", "video/webm"],

        // Settings / extra resources

        background_audio: ["audio/wav", "audio/ogg", "audio/mpeg"],
        foreground_audio: ["audio/wav", "audio/ogg", "audio/mpeg"],
        egf_cover: ["image/png", "image/jpeg"],

        // Scene roles that MUST be XML scene files

        mcq_simple: ["application/xml"],
        hangman_simple: ["application/xml"],
        question_simple: ["application/xml"],
        true_or_false_simple: ["application/xml"],
        game_title_simple: ["application/xml"],
        congratulations_simple: ["application/xml"],
        game_over_simple: ["application/xml"],
        credits_simple: ["application/xml"],
    };

    // Scene-XML inner item roles inferred by suffix/pattern.
    // (EGF spec uses many subroles like mcq_question_image, good_answer_feedback_audio, etc.)

    function allowedMimesForSceneItemRole(role)
    {
        const r = String(role || "");

        // Value-only / inline-only

        if (r === "correct_answer" || r === "answer_to_guess") return null;

        // EGF 1.1 strict: hangman_status_01..09 MUST be PNG or JPEG

        if (/^hangman_status_0[1-9]$/i.test(r))
        {
            return ["image/png", "image/jpeg"];
        }

        // If role clearly indicates the resource kind:

        if (r.endsWith("_text") || r === "question_text")
        {
            return ["text/plain"];
        }

        if (r.endsWith("_image") || r.includes("_image"))
        {
            return ["image/png", "image/jpeg"];
        }

        if (r.endsWith("_audio") || r.includes("_audio"))
        {
            return ["audio/wav", "audio/ogg", "audio/mpeg"];
        }

        if (r.endsWith("_video") || r.includes("_video"))
        {
            return ["video/mp4", "video/webm"];
        }

        return null;
    }

    function assertAllowedMediaType(
    {
        role,
        mediaType,
        allowed,
        context
    })
    {
        if (!allowed)
        {
            return;
        }

        const mt = (mediaType || "").trim();

        if (!mt)
        {
            throw new Error(
                `Invalid EGF: missing required media-type for role "${role}" (${context}). ` +
                `Allowed: ${allowed.join(", ")}`
            );
        }

        if (!allowed.includes(mt))
        {
            throw new Error(
                `Invalid EGF: media-type "${mt}" is not allowed for role "${role}" (${context}). ` +
                `Allowed: ${allowed.join(", ")}`
            );
        }
    }

    function setSceneControlsDisabled(disabled)
    {
        const selectors = [
            "#sceneContent button", "#sceneContent input", "#sceneContent select", "#sceneContent textarea",
            "#sceneFooter button", "#sceneFooter input", "#sceneFooter select", "#sceneFooter textarea"
        ];

        for (const sel of selectors)
        {
            document.querySelectorAll(sel).forEach(el =>
            {
                el.disabled = !!disabled;

                if (el.classList.contains("choice"))
                {
                    el.setAttribute("aria-disabled", disabled ? "true" : "false");
                }
            });
        }
    }

    function pauseAllMediaInDom()
    {
        sceneWrap.querySelectorAll("audio, video").forEach(m =>
        {
            try
            {
                m.pause();
            }
            catch
            {

            }
        });
    }

    async function resumeMediaFromSnapshot()
    {
        if (!pauseSnapshot)
        {
            return;
        }

        if (audioState.bg && pauseSnapshot.bgWasPlaying && !bgMute.checked)
        {
            try
            {
                await audioState.bg.play();
            }
            catch
            {

            }
        }

        if (audioState.main && pauseSnapshot.mainWasPlaying)
        {
            try
            {
                await audioState.main.play();
            }
            catch
            {

            }
        }

        for (const x of audioState.fg)
        {
            const wasPlaying = pauseSnapshot.fgWasPlayingIds?.has(x.id);

            if (wasPlaying && x.el)
            {
                try
                {
                    await x.el.play();
                }
                catch
                {

                }
            }
        }

        applyForegroundMuteIfNeeded();
        applyBgDuckIfNeeded();
    }

    async function setPaused(on)
    {
        if (!zip)
        {
            return;
        }

        if (on === isPaused)
        {
            return;
        }

        isPaused = on;

        if (isPaused)
        {
            pauseSnapshot = {
                bgWasPlaying: !!(audioState.bg && !audioState.bg.paused),
                mainWasPlaying: !!(audioState.main && !audioState.main.paused),
                fgWasPlayingIds: new Set(audioState.fg.filter(x => x.el && !x.el.paused).map(x => x.id))
            };

            if (audioState.bg)
            {
                try
                {
                    audioState.bg.pause();
                }
                catch
                {

                }
            }

            if (audioState.main)
            {
                try
                {
                    audioState.main.pause();
                }
                catch
                {

                }
            }

            for (const x of audioState.fg)
            {
                try
                {
                    x.el.pause();
                }
                catch
                {

                }
            }

            pauseAllMediaInDom();

            setSceneControlsDisabled(true);

            document.body.classList.add("paused");
            setBtnLabel(btnPause, "▶", t("resume"));
            btnPause.classList.add("pauseOn");
            pauseOverlay.setAttribute("aria-hidden", "false");

            return;
        }

        document.body.classList.remove("paused");
        setBtnLabel(btnPause, "⏸", t("pause"));
        btnPause.classList.remove("pauseOn");
        pauseOverlay.setAttribute("aria-hidden", "true");

        setSceneControlsDisabled(false);
        setNavButtons();

        await resumeMediaFromSnapshot();
        pauseSnapshot = null;

        if (pendingNav)
        {
            const p = pendingNav;
            pendingNav = null;

            if (p.type === "next")
            {
                goNext();
            }

            else if (p.type === "scene" && p.id)
            {
                goToSceneId(p.id);
            }
        }
    }

    function safeGoNext()
    {
        if (isPaused)
        {
            pendingNav = {
                type: "next"
            };

            return;
        }

        goNext();
    }

    function safeGoToSceneId(id)
    {
        if (isPaused)
        {
            pendingNav = {
                type: "scene",
                id
            };

            return;
        }

        goToSceneId(id);
    }

    function posixNormalize(path)
    {
        const parts = path.split("/").filter(p => p.length > 0);
        const out = [];

        for (const p of parts)
        {
            if (p === ".")
            {
                continue;
            }

            if (p === "..")
            {
                out.pop();
                continue;
            }

            out.push(p);
        }

        return out.join("/");
    }

    function resolveRelative(baseDir, href)
    {
        if (!href)
        {
            return null;
        }

        // href MUST be a relative path (no leading "/")

        if (href.startsWith("/"))
        {
            throw new Error(
                `Invalid href: absolute paths are not allowed (href="${href}"). ` +
                `Use a relative path from the current file location.`
            );
        }

        // Defensive: forbid backslashes (Windows paths)

        if (href.includes("\\"))
        {
            throw new Error(
                `Invalid href: backslashes are not allowed (href="${href}"). Use "/" separators.`
            );
        }

        // Build relative path from baseDir

        const joined = (baseDir ? (baseDir.replace(/\/?$/, "/")) : "") + href;

        // Normalize and reject traversal / empty results

        const norm = posixNormalize(joined);

        if (!norm || norm === ".")
        {
            throw new Error(`Invalid href: resolves to an empty path (href="${href}").`);
        }

        // Reject traversal after normalization (extra safety)

        if (norm.split("/").some(seg => seg === ".."))
        {
            throw new Error(`Invalid href: path traversal is not allowed (href="${href}").`);
        }

        return norm;
    }

    function dirname(path)
    {
        const i = path.lastIndexOf("/");

        return i >= 0 ? path.slice(0, i + 1) : "";
    }

    function getFileNameFromUrl(url, fallback = "package.egf")
    {
        try
        {
            const u = new URL(url, window.location.href);
            const last = u.pathname.split("/").filter(Boolean).pop();

            return last || fallback;
        }
        catch
        {
            return fallback;
        }
    }

    async function readZipText(path)
    {
        const f = zip.file(path);

        if (!f)
        {
            throw new Error(`Missing file in ZIP: ${path}`);
        }

        return await f.async("string");
    }

    async function readZipBlobUrl(path, mimeType)
    {
        const f = zip.file(path);

        if (!f)
        {
            throw new Error(`Missing file in ZIP: ${path}`);
        }

        const blob = await f.async("blob");
        const b = mimeType ? new Blob([blob],
        {
            type: mimeType
        }) : blob;

        const url = URL.createObjectURL(b);

        // Track for cleanup (scene resources)

        trackSceneUrl(url);

        return url;
    }

    function parseXml(xmlText)
    {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, "application/xml");
        const err = doc.querySelector("parsererror");

        if (err)
        {
            throw new Error("Invalid XML: " + err.textContent.slice(0, 200));
        }

        return doc;
    }

    function getAttr(el, name)
    {
        const v = el.getAttribute(name);

        return v == null ? null : v;
    }

    function getTextDirect(el)
    {
        const t = (el.textContent || "").trim();

        return t.length ? t : "";
    }

    function parseItemElement(el, baseDirForHref)
    {
        const role = getAttr(el, "role") || "";
        const id = getAttr(el, "id") || null;
        const mediaType = getAttr(el, "media-type") || null;
        const hrefRaw = getAttr(el, "href");
        const hrefPath = hrefRaw ? resolveRelative(baseDirForHref, hrefRaw) : null;

        const value = getAttr(el, "value");
        const caseSensitive = getAttr(el, "case-sensitive");
        const diacriticSensitive = getAttr(el, "diacritic-sensitive");
        const sceneRef = getAttr(el, "scene-ref");
        const enableNextAtStart = getAttr(el, "enable-next-button-at-start");

        const inlineText = hrefPath ? "" : getTextDirect(el);

        const childEls = Array.from(el.children).filter(c => c.tagName === "item");
        const children = childEls.map(c => parseItemElement(c, baseDirForHref));

        return {
            role,
            id,
            mediaType,
            hrefPath,
            hrefRaw,
            value,
            caseSensitive,
            diacriticSensitive,
            sceneRef,
            enableNextAtStart,
            inlineText,
            children
        };
    }

    function assertSafeZipRelativePath(p,
    {
        label = "path"
    } = {})
    {
        if (p == null)
        {
            throw new Error(`Invalid ${label}: missing value.`);
        }

        const raw = String(p).trim();

        if (!raw)
        {
            throw new Error(`Invalid ${label}: empty.`);
        }

        // MUST be relative, not absolute (no leading "/")

        if (raw.startsWith("/"))
        {
            throw new Error(`Invalid ${label}: must be a relative path from ZIP root (got an absolute path starting with "/").`);
        }

        // Disallow backslashes to avoid Windows path tricks

        if (raw.includes("\\"))
        {
            throw new Error(`Invalid ${label}: backslashes are not allowed (use "/" separators).`);
        }

        const parts = raw.split("/");

        // Disallow traversal

        for (const seg of parts)
        {
            if (seg === "..")
            {
                throw new Error(`Invalid ${label}: path traversal ("..") is not allowed.`);
            }
        }

        // Normalize (your existing posixNormalize is fine)

        const norm = posixNormalize(raw);

        if (!norm || norm === ".")
        {
            throw new Error(`Invalid ${label}: resolves to an empty path.`);
        }

        return norm;
    }

    async function validateMimetypeOrThrow(z)
    {
        // MUST exist at ZIP root, filename exactly "mimetype"

        const f = z.file("mimetype");

        if (!f)
        {
            throw new Error('Invalid EGF package: missing required file "mimetype" at ZIP root.');
        }

        // Read as bytes -> strict UTF-8 decode, then compare EXACTLY (no trim)

        const bytes = await f.async("uint8array");
        const text = new TextDecoder("utf-8",
        {
            fatal: true
        }).decode(bytes);

        const expected = "application/egf+zip";

        // MUST contain only this exact string (no newline, no spaces)

        if (text !== expected)
        {
            // Helpful diagnostics (show escaped newlines etc.)

            const shown = text
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n")
                .replace(/\t/g, "\\t");

            throw new Error(
                'Invalid EGF package: file "mimetype" must contain exactly: ' +
                `"${expected}". Got: "${shown}".`
            );
        }
    }

    async function locateCoreFile(z)
    {
        const containerPath = "META-INF/container.xml";
        const containerFile = z.file(containerPath);

        if (!containerFile)
        {
            throw new Error(`Invalid EGF package: missing required file "${containerPath}".`);
        }

        const xmlText = await containerFile.async("string");
        const doc = parseXml(xmlText);

        // root element must be <container>

        const containerEl = doc.documentElement;

        if (!containerEl || containerEl.localName !== "container")
        {
            throw new Error(`Invalid EGF package: "${containerPath}" root element must be <container>.`);
        }

        // REQUIRED: <container version="1.0">

        const ver = (containerEl.getAttribute("version") || "").trim();

        if (ver !== "1.0")
        {
            throw new Error(
                `Invalid EGF package: "${containerPath}" <container> must have version="1.0" (got "${ver || "missing"}").`
            );
        }

        // REQUIRED: <rootfiles>

        const rootfilesEl = Array.from(containerEl.children).find(n => n.localName === "rootfiles");

        if (!rootfilesEl)
        {
            throw new Error(`Invalid EGF package: "${containerPath}" missing <rootfiles>.`);
        }

        // REQUIRED: exactly one <rootfile>

        const rootfileEls = Array.from(rootfilesEl.children).filter(n => n.localName === "rootfile");

        if (rootfileEls.length === 0)
        {
            throw new Error(`Invalid EGF package: "${containerPath}" must contain a <rootfile>.`);
        }

        if (rootfileEls.length !== 1)
        {
            throw new Error(
                `Invalid EGF package: "${containerPath}" must contain exactly one <rootfile> (found ${rootfileEls.length}).`
            );
        }

        const rootfile = rootfileEls[0];

        // REQUIRED: full-path attribute

        const fullPathRaw = (rootfile.getAttribute("full-path") || "").trim();

        if (!fullPathRaw)
        {
            throw new Error(`Invalid EGF package: <rootfile> missing required attribute "full-path".`);
        }

        // REQUIRED: id attribute

        const idRaw = (rootfile.getAttribute("id") || "").trim();

        if (!idRaw)
        {
            throw new Error(`Invalid EGF package: <rootfile> missing required attribute "id".`);
        }

        // Light sanity check (avoid weird whitespace ids)

        if (/\s/.test(idRaw))
        {
            throw new Error(`Invalid EGF package: <rootfile> attribute "id" must not contain whitespace.`);
        }

        // Your existing safe-path validation

        const fullPath = assertSafeZipRelativePath(fullPathRaw,
        {
            label: 'rootfile full-path'
        });

        if (!z.file(fullPath))
        {
            throw new Error(
                `Invalid EGF package: EGF Core File not found at path "${fullPath}" referenced by "${containerPath}".`
            );
        }

        // Save for debugging / About panel / future multi-root support

        return fullPath;
    }

    function buildSceneIndexMap()
    {
        sceneIndexById = new Map();
        sequence.forEach((id, idx) => sceneIndexById.set(id, idx));
    }

    function validateSpecialScenesUniquenessInManifestOrThrow()
    {
        const requiredSpecialRoles = [
            "game_title_simple",
            "congratulations_simple",
            "game_over_simple",
            "credits_simple",
        ];

        const errors = [];

        for (const role of requiredSpecialRoles)
        {
            const ids = [];

            for (const [id, it] of manifestById.entries())
            {
                if (it?.role === role)
                {
                    ids.push(id);
                }
            }

            if (ids.length === 0)
            {
                errors.push(`Invalid EGF: manifest MUST contain exactly one item with role="${role}" (found 0).`);
            }
            else if (ids.length > 1)
            {
                errors.push(
                    `Invalid EGF: manifest MUST NOT contain duplicate items with role="${role}" ` +
                    `(found ${ids.length}: ${ids.map(x => `"${x}"`).join(", ")}).`
                );
            }
        }

        if (errors.length)
        {
            throw new Error(errors.join("\n"));
        }
    }

    function validateSequenceOrderOrThrow(
    {
        compat10 = false
    } = {})
    {
        const errors = [];
        const warnings = [];

        // Required special scenes (spec says Core MUST include them)

        const missing = [];

        if (!gameState.idGameTitle)
        {
            missing.push("game_title_simple");
        }

        if (!gameState.idCongratulations)
        {
            missing.push("congratulations_simple");
        }

        if (!gameState.idGameOver)
        {
            missing.push("game_over_simple");
        }

        if (!gameState.idCredits)
        {
            missing.push("credits_simple");
        }

        if (missing.length)
        {
            errors.push(
                `Invalid EGF: missing required Special Scene(s): ${missing.join(", ")}.`
            );
        }

        // If we can't index, stop here

        if (!errors.length)
        {
            const last = sequence.length - 1;

            const idxTitle = sceneIndexById.get(gameState.idGameTitle);
            const idxCongrats = sceneIndexById.get(gameState.idCongratulations);
            const idxGameOver = sceneIndexById.get(gameState.idGameOver);
            const idxCredits = sceneIndexById.get(gameState.idCredits);

            // Defensive checks

            if (idxTitle == null)
            {
                errors.push("Invalid EGF: game_title_simple not found in <sequence>.");
            }

            if (idxCongrats == null)
            {
                errors.push("Invalid EGF: congratulations_simple not found in <sequence>.");
            }

            if (idxGameOver == null)
            {
                errors.push("Invalid EGF: game_over_simple not found in <sequence>.");
            }

            if (idxCredits == null)
            {
                errors.push("Invalid EGF: credits_simple not found in <sequence>.");
            }

            if (!errors.length)
            {
                // Normative order constraints (exact positions)

                if (idxTitle !== 0)
                {
                    errors.push(
                        `Invalid EGF: Game Title Scene (game_title_simple) MUST be the first Scene in <sequence> (found at index ${idxTitle}).`
                    );
                }

                if (idxCredits !== last)
                {
                    errors.push(
                        `Invalid EGF: Credits Scene (credits_simple) MUST be the last Scene in <sequence> (found at index ${idxCredits}, expected ${last}).`
                    );
                }

                if (idxGameOver !== last - 1)
                {
                    errors.push(
                        `Invalid EGF: Game Over Scene (game_over_simple) MUST be the penultimate Scene in <sequence> (found at index ${idxGameOver}, expected ${last - 1}).`
                    );
                }

                if (idxCongrats !== last - 2)
                {
                    errors.push(
                        `Invalid EGF: Congratulations Scene (congratulations_simple) MUST be the antepenultimate Scene in <sequence> (found at index ${idxCongrats}, expected ${last - 2}).`
                    );
                }

                // Normative adjacency constraints

                if (idxCongrats + 1 !== idxGameOver)
                {
                    errors.push(
                        `Invalid EGF: Congratulations Scene MUST be immediately followed by Game Over (idxCongrats=${idxCongrats}, idxGameOver=${idxGameOver}).`
                    );
                }

                if (idxGameOver + 1 !== idxCredits)
                {
                    errors.push(
                        `Invalid EGF: Game Over Scene MUST be immediately followed by Credits (idxGameOver=${idxGameOver}, idxCredits=${idxCredits}).`
                    );
                }

                // Roles that MUST be between Game Title and Congratulations

                const mustBeBetween = new Set([
                    "text_simple",
                    "image_simple",
                    "video_simple",
                    "audio_simple",
                    "mcq_simple",
                    "hangman_simple",
                    "question_simple",
                    "true_or_false_simple",
                ]);

                for (let i = 0; i < sequence.length; i++)
                {
                    const sceneId = sequence[i];
                    const it = manifestById.get(sceneId);
                    const role = it?.role;

                    if (!role)
                    {
                        continue;
                    }

                    if (mustBeBetween.has(role))
                    {
                        // MUST appear somewhere between Title (exclusive) and Congrats (exclusive)

                        if (!(i > idxTitle && i < idxCongrats))
                        {
                            errors.push(
                                `Invalid EGF: Scene "${sceneId}" with role "${role}" MUST be placed between Game Title and Congratulations (found at index ${i}, title=${idxTitle}, congrats=${idxCongrats}).`
                            );
                        }
                    }
                }
            }
        }

        // Surface warnings (non-fatal)

        if (warnings.length)
        {
            setWarnings(warnings, true);
        }

        else
        {
            setWarnings([], true);
        }

        if (errors.length)
        {
            if (compat10)
            {
                setWarnings([
                    "⚠️ EGF 1.0 compatibility mode: sequence order constraints are relaxed.",
                    ...errors
                ], true);

                return;
            }

            setWarnings(errors, true);
            throw new Error(errors.join("\n"));
        }
    }

    function findSpecialSceneIds()
    {
        gameState.idGameTitle = sequence[0] || null;

        for (const [id, it] of manifestById.entries())
        {
            if (it.role === "game_title_simple")
            {
                gameState.idGameTitle = id;
            }

            if (it.role === "congratulations_simple")
            {
                gameState.idCongratulations = id;
            }

            if (it.role === "game_over_simple")
            {
                gameState.idGameOver = id;
            }

            if (it.role === "credits_simple")
            {
                gameState.idCredits = id;
            }

            if (it.role === "egf_cover")
            {
                gameState.coverItem = it;
            }
        }
    }

    function computeDefaultGameplayScope()
    {
        const idxTitle = sceneIndexById.get(gameState.idGameTitle) ?? 0;
        const idxCongrats = sceneIndexById.get(gameState.idCongratulations) ?? (sequence.length - 3);
        const fromIdx = Math.min(idxTitle + 1, sequence.length - 1);
        const toIdx = Math.max(fromIdx, idxCongrats - 1);
        const scopeFromId = sequence[fromIdx] ?? null;
        const scopeToId = sequence[toIdx] ?? null;

        return {
            scopeFromId,
            scopeToId,
            fromIdx,
            toIdx
        };
    }

    function buildAudioSettings()
    {
        gameState.bgItems = [];
        gameState.fgItemsBySceneId = new Map();

        for (const [id, it] of manifestById.entries())
        {

            if (it.role === "background_audio" && settingsRefs.has(id))
            {
                let scopeFromId = it.scopeFromId ?? it.scopeFrom ?? it["scope-from"] ?? it.scope_from ?? null;
                let scopeToId = it.scopeToId ?? it.scopeTo ?? it["scope-to"] ?? it.scope_to ?? null;

                if (!scopeFromId || !scopeToId)
                {
                    const d = computeDefaultGameplayScope();
                    scopeFromId = d.scopeFromId;
                    scopeToId = d.scopeToId;
                }

                const scopeFromIdx = sceneIndexById.get(scopeFromId);
                const scopeToIdx = sceneIndexById.get(scopeToId);
                gameState.bgItems.push(
                {
                    id,
                    hrefPath: it.hrefPath,
                    mediaType: it.mediaType,
                    scopeFromId,
                    scopeToId,
                    scopeFromIdx: scopeFromIdx ?? 0,
                    scopeToIdx: scopeToIdx ?? (sequence.length - 1),
                });
            }
        }

        for (const [id, it] of manifestById.entries())
        {
            if (it.role === "foreground_audio" && settingsRefs.has(id))
            {
                const sceneRef = it.sceneRef || it["scene-ref"] || it.scene_ref || null;

                if (!sceneRef)
                {
                    continue;
                }

                const list = gameState.fgItemsBySceneId.get(sceneRef) || [];
                list.push(
                {
                    id,
                    hrefPath: it.hrefPath,
                    mediaType: it.mediaType
                });
                gameState.fgItemsBySceneId.set(sceneRef, list);
            }
        }
    }

    function updateAboutUi()
    {
        kvVer.textContent = egfVersion || "—";

        kvTitle.textContent = meta.title || "—";
        kvCreator.textContent = meta.creator || "—";
        kvDesc.textContent = meta.description || "—";
        kvDate.textContent = meta.date || "—";
        kvModified.textContent = meta.modified || "—";

        if (kvWrong)
        {
            kvWrong.textContent = `${gameState.wrongCount} / ${gameState.maxWrong}`;
        }

        if (kvCurrentScene)
        {
            const idx = (gameState.currentIndex ?? 0);
            const total = (sequence?.length ?? 0);
            kvCurrentScene.textContent = total ? `${idx + 1} / ${total}` : "—";
        }

        if (kvCurrentSceneId)
        {
            const sceneId = sequence?.[gameState.currentIndex];
            kvCurrentSceneId.textContent = sceneId || "—";
        }

        if (kvCurrentRole)
        {
            const sceneId = sequence?.[gameState.currentIndex];
            const it = sceneId ? manifestById.get(sceneId) : null;
            kvCurrentRole.textContent = it?.role || "—";
        }
    }

    function computeGameplayPctForIndex(idx)
    {
        const start = gameState.gameplayStartIdx ?? 0;
        const end = gameState.gameplayEndIdx ?? 0;

        // Before gameplay starts (title, etc.)

        if (idx < start)
        {
            return 0;
        }

        // During gameplay (start..end), congratulations => 100%

        if (idx <= end)
        {
            // Edge case: "congratulations" right after the title
            // start === end => the only "gameplay" scene is already the end => 100%

            if (end <= start)
            {
                return (idx >= end) ? 100 : 0;
            }

            // Normal case: linear progression, and idx === end ⇒ 100%.

            if (idx >= end)
            {
                return 100;
            }

            const denom = (end - start);
            const pct = ((idx - start) / denom) * 100;

            return Math.max(0, Math.min(100, pct));
        }

        // After congratulations: keep last known gameplay pct

        return Math.max(0, Math.min(100, gameState.lastGameplayPct ?? 0));
    }

    function lockGameplayProgressAtCurrentScene()
    {
        // Capture the % of the scene that triggered the navigation

        const pct = computeGameplayPctForIndex(gameState.currentIndex);
        gameState.lastGameplayPct = pct;
    }

    // ===== Gradient helpers (Score % uses main bar gradient) =====

    function getProgressGradientFromMainBar()
    {
        const src = roleBarFill || barFill;
        if (!src) return null;

        const cs = getComputedStyle(src);

        const bgImg = cs.backgroundImage;
        if (bgImg && bgImg !== "none") return bgImg;

        const bg = cs.background;
        if (bg && bg !== "none") return bg;

        return null;
    }

    function applyGradientToText(el, gradient)
    {
        if (!el || !gradient) return;

        el.style.backgroundImage = gradient;
        el.style.webkitBackgroundClip = "text";
        el.style.backgroundClip = "text";
        el.style.color = "transparent";
    }

    function syncScoreProgressGradient()
    {
        if (!scoreProgressPct) return;

        const grad = getProgressGradientFromMainBar();
        if (grad) applyGradientToText(scoreProgressPct, grad);
    }

    function setProgressUI(box, textEl, fillEl, show, pct)
    {
        if (!box || !textEl || !fillEl) return;

        box.style.display = show ? "flex" : "none";
        if (!show) return;

        textEl.textContent = `${Math.round(pct)}%`;
        fillEl.style.width = `${pct}%`;
    }

    function updateProgressUi()
    {
        // No package loaded => set everything to zero/hidden

        if (!zip || !sequence?.length)
        {
            // Bars (if they still exist in the DOM)

            setProgressUI(progressBox, progressText, barFill, false, 0);
            setProgressUI(rolePill, roleProgressText, roleBarFill, false, 0);

            // Score modal: text only

            if (scoreProgressPct)
            {
                scoreProgressPct.textContent = "—";
                syncScoreProgressGradient();
            }
            return;
        }

        const idx = gameState.currentIndex ?? 0;
        const start = gameState.gameplayStartIdx ?? 0;

        // Before gameplay starts (e.g., title) => no progress displayed

        if (idx < start)
        {
            setProgressUI(progressBox, progressText, barFill, false, 0);
            setProgressUI(rolePill, roleProgressText, roleBarFill, false, 0);

            if (scoreProgressPct)
            {
                scoreProgressPct.textContent = "0%";
                syncScoreProgressGradient();
            }
            return;
        }

        // Percent calculation

        const pct = computeGameplayPctForIndex(idx);

        // Store "gameplay progress" (like in your code)

        if (idx <= (gameState.gameplayEndIdx ?? idx))
        {
            gameState.lastGameplayPct = pct;
        }

        // Update the in-game bars

        setProgressUI(progressBox, progressText, barFill, true, pct);
        setProgressUI(rolePill, roleProgressText, roleBarFill, true, pct);

        // Score modal: TEXT ONLY (no bar)

        if (scoreProgressPct)
        {
            scoreProgressPct.textContent = `${Math.round(pct)}%`;
            syncScoreProgressGradient();
        }
    }

    function setNavButtons()
    {
        const hasLoadedPackage = !!currentPackageFile;

        btnReset.disabled = !hasLoadedPackage;
        btnPause.disabled = !hasLoadedPackage;
        btnScore.disabled = !hasLoadedPackage;

        if (btnDownloadEgf)
        {
            btnDownloadEgf.disabled = !hasLoadedPackage;
        }
    }

    function shouldOverrideToGameOver()
    {
        if (!gameState.sessionActive)
        {
            return false;
        }

        if (!gameState.idGameOver)
        {
            return false;
        }

        return gameState.wrongCount >= gameState.maxWrong;
    }

    function goToSceneIndex(idx)
    {
        if (!zip)
        {
            return;
        }

        gameState.currentIndex = Math.max(0, Math.min(sequence.length - 1, idx));
        renderCurrentScene().catch(err => showFatal(err));
        setNavButtons();
        updateProgressUi();
    }

    function goToSceneId(sceneId)
    {
        const idx = sceneIndexById.get(sceneId);

        if (idx == null)
        {
            return;
        }

        goToSceneIndex(idx);
    }

    function goNext()
    {
        const idx = gameState.currentIndex + 1;

        if (idx < sequence.length)
        {
            goToSceneIndex(idx);
        }
    }

    function showFatal(err)
    {
        console.error(err);
        sceneContent.innerHTML = `<div class="notice warn"><b>${escapeHtml(String(err.message || err))}</b><br><br><span class="muted">See the console for details.</span></div>`;
        sceneFooter.innerHTML = "";
        sceneName.textContent = t("error");
        sceneSub.textContent = t("cannotRender");
        updateDocumentTitle();
    }

    // EGF 1.1: BG is controlled by scope (no role-based exclusion).
    // The "primary main audio" logic (audioState.mainIsPrimary) will pause BG when required.

    function pickBgItemForIndex(sceneIdx)
    {
        // INCLUSIVE: BG plays on scope-from and scope-to
        const candidates = gameState.bgItems.filter(x =>
            sceneIdx >= x.scopeFromIdx && sceneIdx <= x.scopeToIdx
        );

        if (!candidates.length) return null;

        // Most specific scope wins (latest scope-from)
        candidates.sort((a, b) => (b.scopeFromIdx - a.scopeFromIdx));
        return candidates[0];
    }

    // EGF 1.1: FG (settings foreground_audio) is controlled by scene-ref.
    // If a Scene has primary main audio, attachMainMedia() will pause FG while main plays.

    async function ensureBackgroundAudioForScene(sceneIdx)
    {
        const chosen = pickBgItemForIndex(sceneIdx);

        if (!chosen)
        {
            if (audioState.bg)
            {
                stopAndRevoke(audioState.bg);
                audioState.bg = null;
                audioState.bgItemId = null;
            }

            return;
        }

        if (audioState.bgItemId === chosen.id && audioState.bg)
        {
            applyBgDuckIfNeeded();

            return;
        }

        if (audioState.bg)
        {
            stopAndRevoke(audioState.bg);
        }

        audioState.bg = new Audio();
        audioState.bg.loop = true;
        audioState.bgItemId = chosen.id;

        const url = await readZipBlobUrl(chosen.hrefPath, chosen.mediaType);
        audioState.bg.src = url;

        applyBgDuckIfNeeded();

        if (!isPaused)
        {
            try
            {
                await audioState.bg.play();
            }
            catch
            {

            }
        }

        applyBgDuckIfNeeded();
    }

    async function playForegroundAudioForScene(sceneId)
    {
        stopAllForegroundAudio();

        const list = gameState.fgItemsBySceneId.get(sceneId) || [];

        for (const item of list)
        {
            const el = new Audio();
            const url = await readZipBlobUrl(item.hrefPath, item.mediaType);
            el.src = url;

            const baseVol = 1.0;
            el.volume = fgMute.checked ? 0 : clamp01(baseVol * clamp01(audioState.fgUserVolume));

            audioState.fg.push(
            {
                id: item.id,
                el,
                baseVol
            });
            try
            {
                if (!isPaused) await el.play();
            }
            catch
            {}

            el.addEventListener("play", applyBgDuckIfNeeded);
            el.addEventListener("pause", applyBgDuckIfNeeded);
            el.addEventListener("ended", applyBgDuckIfNeeded);
        }

        applyForegroundMuteIfNeeded();
        applyBgDuckIfNeeded();
    }

    async function renderResource(item, baseLabel)
    {
        const role = item.role || baseLabel || "resource";
        const media = item.mediaType || item["media-type"] || item.media_type || "";

        if (media === "text/plain" || role.endsWith("_text") || role === "text_simple" || role === "question_text")
        {
            let text = "";

            if (item.hrefPath)
            {
                text = await readZipText(item.hrefPath);
            }

            else
            {
                text = item.inlineText || "";
            }

            const div = document.createElement("div");
            div.className = "textBlock";
            div.textContent = text;

            return div;
        }

        if (media?.startsWith("image/") || role.endsWith("_image") || role.includes("image"))
        {
            const img = document.createElement("img");
            img.className = "imgBlock";

            if (!item.hrefPath)
            {
                img.alt = "Missing image href";
                return img;
            }

            img.src = await readZipBlobUrl(item.hrefPath, media || "image/jpeg");
            img.alt = role;

            return img;
        }

        if (media?.startsWith("audio/") || role.endsWith("_audio") || role.includes("audio"))
        {
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "auto";

            if (item.hrefPath)
            {
                audio.src = await readZipBlobUrl(item.hrefPath, media || "audio/mpeg");
            }

            audio.volume = fgMute.checked ? 0 : clamp01(audioState.fgUserVolume);

            return audio;
        }

        if (media?.startsWith("video/") || role.endsWith("_video") || role.includes("video"))
        {
            const video = document.createElement("video");
            video.controls = true;
            video.preload = "auto";

            if (item.hrefPath)
            {
                video.src = await readZipBlobUrl(item.hrefPath, media || "video/mp4");
            }

            return video;
        }

        const pre = document.createElement("pre");
        pre.className = "textBlock muted";
        pre.textContent = `Unsupported resource: role=${role} media-type=${media}\n${item.hrefPath || ""}`;

        return pre;
    }

    function normalizeAnswer(str, { caseSensitive, diacriticSensitive })
    {
        let s = String(str ?? "");

        // EGF 1.1: diacritic folding = NFD + remove combining marks (General Category Mn)
  
        if (!diacriticSensitive)
        {
            try {
                s = s.normalize("NFD").replace(/\p{Mn}/gu, "");
            } catch {
                // Partial fallback (doesn’t cover all Unicode Mn marks, but better than nothing without \p{Mn})
      
                s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            }
        }

        // Case-insensitive compare when caseSensitive="false"
  
        if (!caseSensitive)
        {
            s = s.toLocaleLowerCase("und");
        }

        return s;
    }

    function validateTrueOrFalseSimpleSceneOrThrow(items, scenePath)
    {
        const errors = [];

        const questionRoles = new Set([
            "question_text",
            "question_image",
            "question_audio",
            "question_video"
        ]);

        const questions = items.filter(it => questionRoles.has(it.role));
        const goodFb = items.filter(it => it.role === "good_answer_feedback_audio");
        const badFb = items.filter(it => it.role === "wrong_answer_feedback_audio");
        const correct = items.filter(it => it.role === "correct_answer");

        if (questions.length !== 1)
        {
            errors.push(`true_or_false_simple MUST contain exactly 1 question_* item.`);
        }

        if (goodFb.length !== 1)
        {
            errors.push(`true_or_false_simple MUST contain exactly 1 good_answer_feedback_audio.`);
        }

        if (badFb.length !== 1)
        {
            errors.push(`true_or_false_simple MUST contain exactly 1 wrong_answer_feedback_audio.`);
        }

        if (correct.length !== 1)
        {
            errors.push(`true_or_false_simple MUST contain exactly 1 correct_answer item (value="true|false").`);
        }

        if (items.length !== 4)
        {
            errors.push(`true_or_false_simple MUST contain exactly 4 <item> elements (found ${items.length}).`);
        }

        const v = String(correct?.[0]?.value || "").trim();

        if (v !== "true" && v !== "false")
        {
            errors.push(`true_or_false_simple correct_answer value MUST be "true" or "false" (got "${v || "empty"}").`);
        }

        if (errors.length)
        {
            throw new Error(
                `Invalid true_or_false_simple scene (${scenePath}):\n` +
                errors.map(e => "• " + e).join("\n")
            );
        }
    }

    function validateQuestionSimpleSceneOrThrow(items, scenePath)
    {
        const errors = [];

        const questionRoles = new Set([
            "question_text",
            "question_image",
            "question_audio",
            "question_video"
        ]);

        const questions = items.filter(it => questionRoles.has(it.role));
        const goodFb = items.filter(it => it.role === "good_answer_feedback_audio");
        const badFb = items.filter(it => it.role === "wrong_answer_feedback_audio");
        const answer = items.filter(it => it.role === "answer_to_guess");

        if (questions.length !== 1)
        {
            errors.push(`question_simple MUST contain exactly 1 question_* item.`);
        }

        if (goodFb.length !== 1)
        {
            errors.push(`question_simple MUST contain exactly 1 good_answer_feedback_audio.`);
        }

        if (badFb.length !== 1)
        {
            errors.push(`question_simple MUST contain exactly 1 wrong_answer_feedback_audio.`);
        }

        if (answer.length !== 1)
        {
            errors.push(`question_simple MUST contain exactly 1 answer_to_guess item (value="...").`);
        }

        if (items.length !== 4)
        {
            errors.push(`question_simple MUST contain exactly 4 <item> elements (found ${items.length}).`);
        }

        const v = String(answer?.[0]?.value ?? "").trim();

        if (!v)
        {
            errors.push(`question_simple answer_to_guess MUST have a non-empty value attribute.`);
        }

        if (errors.length)
        {
            throw new Error(
                `Invalid question_simple scene (${scenePath}):\n` +
                errors.map(e => "• " + e).join("\n")
            );
        }
    }

    function validateHangmanSimpleSceneOrThrow(items, scenePath)
    {
        const errors = [];

        // EGF 1.1: MUST contain exactly the 12 <item> listed:
        // hangman_status_01..09 (9) + good_answer_audio (1) + wrong_answer_audio (1) + answer_to_guess (1)

        if (items.length !== 12)
        {
            errors.push(`hangman_simple MUST contain exactly 12 <item> elements (found ${items.length}).`);
        }

        const counts = new Map();

        for (const it of items)
        {
            const role = String(it?.role || "");
            if (!role) continue;
            counts.set(role, (counts.get(role) || 0) + 1);
        }

        const requiredStatusRoles = Array.from(
        {
            length: 9
        }, (_, i) =>
        {
            const n = String(i + 1).padStart(2, "0");

            return `hangman_status_${n}`;
        });

        const requiredRoles = [
            ...requiredStatusRoles,
            "good_answer_audio",
            "wrong_answer_audio",
            "answer_to_guess",
        ];

        for (const role of requiredRoles)
        {
            if (!counts.has(role))
            {
                errors.push(`hangman_simple is missing required item role="${role}".`);
            }

            else if (counts.get(role) !== 1)
            {
                errors.push(`hangman_simple MUST contain exactly 1 item role="${role}" (found ${counts.get(role)}).`);
            }
        }

        for (const role of counts.keys())
        {
            if (!requiredRoles.includes(role))
            {
                errors.push(`hangman_simple MUST NOT contain extra item role="${role}" (EGF 1.1 requires exactly the 12 roles).`);
            }
        }

        const IMG_ALLOWED = ["image/png", "image/jpeg"];
        const AUD_ALLOWED = ["audio/wav", "audio/ogg", "audio/mpeg"];

        function mustHaveHrefAndMedia(it, allowed, label)
        {
            if (!it)
            {
                return;
            }

            if (!it.hrefPath)
            {
                errors.push(`${label} MUST have an href attribute (external resource).`);
            }

            const mt = String(it.mediaType || "").trim();

            if (!mt)
            {
                errors.push(`${label} MUST have a media-type attribute.`);
            }

            else if (!allowed.includes(mt))
            {
                errors.push(`${label} media-type "${mt}" is not allowed. Allowed: ${allowed.join(", ")}.`);
            }
        }

        for (const role of requiredStatusRoles)
        {
            const it = items.find(x => x.role === role);
            mustHaveHrefAndMedia(it, IMG_ALLOWED, role);
        }

        mustHaveHrefAndMedia(items.find(x => x.role === "good_answer_audio"), AUD_ALLOWED, "good_answer_audio");
        mustHaveHrefAndMedia(items.find(x => x.role === "wrong_answer_audio"), AUD_ALLOWED, "wrong_answer_audio");

        const ans = items.find(x => x.role === "answer_to_guess");

        if (ans)
        {
            const v = String(ans.value ?? "").trim();

            if (!v)
            {
                errors.push(`answer_to_guess MUST have a non-empty value attribute.`);
            }

            // case-sensitive is REQUIRED in 1.1

            const cs = (ans.caseSensitive ?? ans["case-sensitive"]);
            const csNorm = String(cs ?? "").trim().toLowerCase();

            if (csNorm !== "true" && csNorm !== "false")
            {
                errors.push(`answer_to_guess MUST have case-sensitive="true|false" (got "${String(cs ?? "").trim() || "missing"}").`);
            }

            // diacritic-sensitive OPTIONAL but if present must be true/false

            const ds = (ans.diacriticSensitive ?? ans["diacritic-sensitive"]);

            if (ds != null)
            {
                const dsNorm = String(ds).trim().toLowerCase();

                if (dsNorm !== "true" && dsNorm !== "false")
                {
                    errors.push(`answer_to_guess diacritic-sensitive MUST be "true" or "false" if present (got "${String(ds).trim()}").`);
                }
            }
        }

        if (errors.length)
        {
            throw new Error(
                `Invalid hangman_simple scene (${scenePath}):\n` +
                errors.map(e => "• " + e).join("\n")
            );
        }
    }

    function validateCreditsSimpleSceneOrThrow(items, scenePath)
    {
        const errors = [];

        const fields = items.filter(it => it.role === "credit_field");

        if (fields.length < 1)
        {
            errors.push(`credits_simple MUST contain at least 1 credit_field item.`);
        }

        for (let i = 0; i < fields.length; i++)
        {
            const f = fields[i];
            const label = f.children?.find(x => x.role === "label")?.inlineText?.trim() || "";
            const content = f.children?.find(x => x.role === "content")?.inlineText?.trim() || "";

            if (!label)
            {
                errors.push(`credits_simple credit_field[${i}] is missing child <item role="label">...</item>.`);
            }

            if (!content)
            {
                errors.push(`credits_simple credit_field[${i}] is missing child <item role="content">...</item>.`);
            }
        }

        if (errors.length)
        {
            throw new Error(
                `Invalid credits_simple scene (${scenePath}):\n` +
                errors.map(e => "• " + e).join("\n")
            );
        }
    }

    function validateMcqSimpleSceneOrThrow(items, scenePath)
    {
        const errors = [];

        if (items.length !== 7)
        {
            errors.push(
                `mcq_simple scene MUST contain exactly 7 <item> elements (found ${items.length}).`
            );
        }

        const questionRoles = new Set([
            "mcq_question_text",
            "mcq_question_image",
            "mcq_question_audio",
            "mcq_question_video"
        ]);

        const questions = items.filter(it => questionRoles.has(it.role));
        const goodAnswers = items.filter(it => it.role?.startsWith("good_answer_"));
        const badAnswers = items.filter(it => it.role?.startsWith("wrong_answer_"));
        const goodFb = items.filter(it => it.role === "mcq_good_answer_feedback_audio");
        const badFb = items.filter(it => it.role === "mcq_wrong_answer_feedback_audio");

        if (questions.length !== 1)
        {
            errors.push(`mcq_simple MUST contain exactly 1 question item.`);
        }

        if (goodAnswers.length !== 1)
        {
            errors.push(`mcq_simple MUST contain exactly 1 good_answer_* item.`);
        }

        if (badAnswers.length !== 3)
        {
            errors.push(`mcq_simple MUST contain exactly 3 wrong_answer_* items.`);
        }

        if (goodFb.length !== 1)
        {
            errors.push(`mcq_simple MUST contain exactly 1 mcq_good_answer_feedback_audio.`);
        }

        if (badFb.length !== 1)
        {
            errors.push(`mcq_simple MUST contain exactly 1 mcq_wrong_answer_feedback_audio.`);
        }

        if (errors.length)
        {
            throw new Error(
                `Invalid mcq_simple scene (${scenePath}):\n` +
                errors.map(e => "• " + e).join("\n")
            );
        }
    }

    async function parseSceneFileFromManifest(manifestItem)
    {
        const xmlText = await readZipText(manifestItem.hrefPath);
        const doc = parseXml(xmlText);

        // Validate that the XML root element matches the scene role
        // e.g. role="game_title_simple" => root MUST be <game_title_simple>

        validateSceneRootOrThrow(doc, manifestItem.role, manifestItem.hrefPath);

        const baseDir = dirname(manifestItem.hrefPath);
        const items = Array.from(doc.documentElement.children)
            .filter(el => el.tagName === "item")
            .map(el => parseItemElement(el, baseDir));

        // Call role-specific scene validation during parsing

        switch (manifestItem.role)
        {
            case "mcq_simple":
                validateMcqSimpleSceneOrThrow(items, manifestItem.hrefPath);
                break;

            case "true_or_false_simple":
                validateTrueOrFalseSimpleSceneOrThrow(items, manifestItem.hrefPath);
                break;

            case "question_simple":
                validateQuestionSimpleSceneOrThrow(items, manifestItem.hrefPath);
                break;

            case "hangman_simple":
                validateHangmanSimpleSceneOrThrow(items, manifestItem.hrefPath);
                break;

            case "credits_simple":
                validateCreditsSimpleSceneOrThrow(items, manifestItem.hrefPath);
                break;

                // Strict validation for Special Scenes

            case "game_title_simple":
                validateGameTitleSimpleSceneOrThrow(items, manifestItem.hrefPath);
                break;

            case "congratulations_simple":
                validateCongratulationsSimpleSceneOrThrow(items, manifestItem.hrefPath);
                break;

            case "game_over_simple":
                validateGameOverSimpleSceneOrThrow(items, manifestItem.hrefPath);
                break;
        }

        // Enforce MIME constraints for scene inner items when they reference external resources via href

        for (const it of items)
        {
            if (!it)
            {
                continue;
            }

            const role = it.role || "";
            const allowed = allowedMimesForSceneItemRole(role);

            // Only enforce if it uses href (external resource)

            if (it.hrefPath)
            {
                assertAllowedMediaType(
                {
                    role,
                    mediaType: it.mediaType,
                    allowed,
                    context: `scene file="${manifestItem.hrefPath}"`
                });
            }
        }

        return {
            items
        };
    }

    function findItemByRole(items, roles)
    {
        const set = new Set(Array.isArray(roles) ? roles : [roles]);

        return items.find(it => set.has(it.role)) || null;
    }

    function footerButton(label, opts = {})
    {
        const b = document.createElement("button");
        b.className = "btn" + (opts.kind ? ` ${opts.kind}` : "");
        b.textContent = label;

        if (opts.disabled)
        {
            b.disabled = true;
        }

        if (opts.onClick)
        {
            b.addEventListener("click", opts.onClick);
        }

        return b;
    }

    function nextLockedHint(text)
    {
        const hint = document.createElement("div");
        hint.className = "textBlock muted";
        hint.style.marginTop = "10px";

        // Accessibility (optional)

        hint.setAttribute("role", "status");
        hint.setAttribute("aria-live", "polite");

        hint.textContent = text;
        return hint;
    }

    // Renderers (kept same as previous attempt)

    async function render_text_simple(manifestItem)
    {
        sceneContent.appendChild(await renderResource(manifestItem, "text_simple"));
        sceneFooter.appendChild(footerButton(t("next"),
        {
            onClick: safeGoNext
        }));
    }

    async function render_image_simple(manifestItem)
    {
        sceneContent.appendChild(await renderResource(manifestItem, "image_simple"));
        sceneFooter.appendChild(footerButton(t("next"),
        {
            onClick: safeGoNext
        }));
    }

    async function render_video_simple(manifestItem)
    {
        const enableNextAtStart =
            (String(manifestItem.enableNextAtStart ?? "false").toLowerCase() === "true");

        const video = await renderResource(manifestItem, "video_simple");
        sceneContent.appendChild(video);

        if (!enableNextAtStart)
        {
            sceneContent.appendChild(
                nextLockedHint(t("watchFullVideoToProceedToNextScene"))
            );
        }

        const nextBtn = footerButton(t("next"),
        {
            onClick: safeGoNext,
            disabled: !enableNextAtStart
        });
        sceneFooter.appendChild(nextBtn);

        attachMainMedia(video,
        {
            primary: true
        });

        try
        {
            video.currentTime = 0;
            if (!isPaused) await video.play();
        }
        catch
        {}
        applyBgDuckIfNeeded();

        video.addEventListener("ended", () =>
        {
            if (!enableNextAtStart) nextBtn.disabled = false;
            applyBgDuckIfNeeded();
        });
    }

    async function render_audio_simple(manifestItem)
    {
        const enableNextAtStart =
            (String(manifestItem.enableNextAtStart ?? "false").toLowerCase() === "true");

        const audio = await renderResource(manifestItem, "audio_simple");
        sceneContent.appendChild(audio);

        if (!enableNextAtStart)
        {
            sceneContent.appendChild(
                nextLockedHint(t("listenToFullAudioToProceedToNextScene"))
            );
        }

        const nextBtn = footerButton(t("next"),
        {
            onClick: safeGoNext,
            disabled: !enableNextAtStart
        });
        sceneFooter.appendChild(nextBtn);

        attachMainMedia(audio,
        {
            primary: true
        });
        applyForegroundMuteIfNeeded();

        try
        {
            audio.currentTime = 0;
            if (!isPaused) await audio.play();
        }
        catch
        {}
        applyBgDuckIfNeeded();

        audio.addEventListener("ended", () =>
        {
            if (!enableNextAtStart) nextBtn.disabled = false;
            applyBgDuckIfNeeded();
        });
    }

    async function render_mcq_simple(sceneId, manifestItem)
    {
        const { items } = await parseSceneFileFromManifest(manifestItem);

        const question = findItemByRole(items, [
            "mcq_question_text",
            "mcq_question_image",
            "mcq_question_audio",
            "mcq_question_video"
        ]);

        const goodFb = findItemByRole(items, "mcq_good_answer_feedback_audio");
        const badFb  = findItemByRole(items, "mcq_wrong_answer_feedback_audio");

        const isMcqAnswerRole = (r) =>
            typeof r === "string" && (r.startsWith("good_answer_") || r.startsWith("wrong_answer_"));

            // Keep the order of appearance as in the XML
  
            const options = items.filter(it => isMcqAnswerRole(it.role));

            if (question)
            {
                sceneContent.appendChild(await renderResource(question, "question"));
            }

            const grid = document.createElement("div");
            grid.className = "choices";

            let locked = false;

            const playFeedback = async (fbItem) =>
            {
                if (!fbItem) return;

                const fb = new Audio();
                fb.src = await readZipBlobUrl(fbItem.hrefPath, fbItem.mediaType || "audio/mpeg");
                fb.volume = fgMute.checked ? 0 : clamp01(audioState.fgUserVolume);

                attachMainMedia(fb, { primary: false });
                applyForegroundMuteIfNeeded();

                try { if (!isPaused) await fb.play(); } catch {}

                await new Promise(res => fb.addEventListener("ended", res, { once: true }));
                stopAndRevoke(fb);
            };

            const completeAndAdvance = () =>
            {
                if (shouldOverrideToGameOver())
                {
                    lockGameplayProgressAtCurrentScene();
      
                    return safeGoToSceneId(gameState.idGameOver);
                }
    
                safeGoNext();
            };

            for (const opt of options)
            {
                const btn = document.createElement("button");
                btn.className = "choice";
                btn.type = "button";

                const isCorrectOpt = String(opt.role || "").startsWith("good_answer_");
                btn.dataset.correct = isCorrectOpt ? "1" : "0";

                btn.setAttribute("aria-disabled", "false");

                const badge = document.createElement("div");
                badge.className = "badge";
                badge.textContent = t("option");

                btn.appendChild(badge);
                btn.appendChild(await renderResource(opt, "answer"));

                btn.addEventListener("click", async () =>
                {
                    if (locked || isPaused) return;
                    locked = true;

                    Array.from(grid.querySelectorAll(".choice")).forEach(x =>
                    {
                        x.setAttribute("aria-disabled", "true");
                        x.disabled = true;
                    });

                    const isCorrect = btn.dataset.correct === "1";

                    btn.classList.add("picked", isCorrect ? "is-correct" : "is-wrong");
                    btn.setAttribute("aria-pressed", "true");

                    await new Promise(requestAnimationFrame);

                    if (!isCorrect)
                    {
                        gameState.wrongCount += 1;
                        if (kvWrong) kvWrong.textContent = `${gameState.wrongCount} / ${gameState.maxWrong}`;
                    }

                    await playFeedback(isCorrect ? goodFb : badFb);
                    completeAndAdvance();
            });

            grid.appendChild(btn);
        }

        sceneContent.appendChild(grid);
    }

    async function render_true_or_false_simple(sceneId, manifestItem)
    {
        const
        {
            items
        } = await parseSceneFileFromManifest(manifestItem);
        const question = findItemByRole(items, ["question_text", "question_image", "question_audio", "question_video"]);
        const goodFb = findItemByRole(items, "good_answer_feedback_audio");
        const badFb = findItemByRole(items, "wrong_answer_feedback_audio");
        const correct = findItemByRole(items, "correct_answer");
        const expected = String(correct?.value || "").trim();
        if (question) sceneContent.appendChild(await renderResource(question, "question"));
        const grid = document.createElement("div");
        grid.className = "choices";
        let locked = false;

        const playFeedback = async (fbItem) =>
        {
            if (!fbItem)
            {
                return;
            }

            const fb = new Audio();
            fb.src = await readZipBlobUrl(fbItem.hrefPath, fbItem.mediaType || "audio/mpeg");
            fb.volume = fgMute.checked ? 0 : clamp01(audioState.fgUserVolume);
            attachMainMedia(fb,
            {
                primary: false
            });
            applyForegroundMuteIfNeeded();

            try
            {
                if (!isPaused) await fb.play();
            }
            catch
            {

            }
            await new Promise(res => fb.addEventListener("ended", res,
            {
                once: true
            }));
            stopAndRevoke(fb);
        };

        const completeAndAdvance = () =>
        {
            if (shouldOverrideToGameOver())
            {
                lockGameplayProgressAtCurrentScene();

                return safeGoToSceneId(gameState.idGameOver);
            }

            safeGoNext();
        };

        const mk = (label, val) =>
        {
            const btn = document.createElement("button");
            btn.className = "choice";
            btn.type = "button";
            btn.dataset.value = val;
            btn.setAttribute("aria-disabled", "false");
            btn.innerHTML = `<div class="badge">${escapeHtml(t("option"))}</div><div class="textBlock">${escapeHtml(label)}</div>`;

            btn.addEventListener("click", async () =>
            {
                if (locked || isPaused) return;
                locked = true;

                Array.from(grid.querySelectorAll(".choice")).forEach(x =>
                {
                    x.setAttribute("aria-disabled", "true");
                    x.disabled = true;
                });

                const isCorrect = (btn.dataset.value === expected);

                // Apply the green/red background to the selected choice

                btn.classList.add("picked", isCorrect ? "is-correct" : "is-wrong");
                btn.setAttribute("aria-pressed", "true");

                // Let the browser paint the color before starting the audio

                await new Promise(requestAnimationFrame);

                if (!isCorrect)
                {
                    gameState.wrongCount += 1;
                    if (kvWrong) kvWrong.textContent = `${gameState.wrongCount} / ${gameState.maxWrong}`;
                }

                await playFeedback(isCorrect ? goodFb : badFb);
                completeAndAdvance();
            });

            return btn;
        };

        grid.appendChild(mk(t("true"), "true"));
        grid.appendChild(mk(t("false"), "false"));
        sceneContent.appendChild(grid);
    }

    async function render_question_simple(sceneId, manifestItem)
    {
        const
        {
            items
        } = await parseSceneFileFromManifest(manifestItem);
        const question = findItemByRole(items, ["question_text", "question_image", "question_audio", "question_video"]);
        const goodFb = findItemByRole(items, "good_answer_feedback_audio");
        const badFb = findItemByRole(items, "wrong_answer_feedback_audio");
        const answer = findItemByRole(items, "answer_to_guess");
        const expectedRaw = String(answer?.value ?? "");
        const caseSensitive = String(answer?.caseSensitive ?? answer?.["case-sensitive"]).toLowerCase() === "true";
        const diacriticSensitive = String(answer?.diacriticSensitive ?? answer?.["diacritic-sensitive"]).toLowerCase() === "true";

        if (question)
        {
            sceneContent.appendChild(await renderResource(question, "question"));
        }

        const input = document.createElement("input");

        input.className = "textInput";
        input.placeholder = t("typeAnswer");
        input.autocomplete = "off";

        const submit = footerButton(t("submit"),
        {
            kind: "good"
        });
        const row = document.createElement("div");
        row.className = "inputRow";

        row.appendChild(input);
        row.appendChild(submit);
        sceneContent.appendChild(row);

        const clearInputFeedback = () => {
            input.classList.remove("picked", "is-correct", "is-wrong");
            input.removeAttribute("aria-invalid");
        };

        const setInputFeedback = (ok) => {
            clearInputFeedback();
            input.classList.add("picked", ok ? "is-correct" : "is-wrong");
            input.setAttribute("aria-invalid", ok ? "false" : "true");
        };

        const playFeedback = async (fbItem) =>
        {
            if (!fbItem)
            {
                return;
            }

            const fb = new Audio();
            fb.src = await readZipBlobUrl(fbItem.hrefPath, fbItem.mediaType || "audio/mpeg");
            fb.volume = fgMute.checked ? 0 : clamp01(audioState.fgUserVolume);
            attachMainMedia(fb,
            {
                primary: false
            });
            applyForegroundMuteIfNeeded();
            try
            {
                if (!isPaused) await fb.play();
            }
            catch
            {

            }

            await new Promise(res => fb.addEventListener("ended", res,
            {
                once: true
            }));
            stopAndRevoke(fb);
        };

        const completeAndAdvance = () =>
        {
            if (shouldOverrideToGameOver())
            {
                lockGameplayProgressAtCurrentScene();

                return safeGoToSceneId(gameState.idGameOver);
            }

            safeGoNext();
        };

        let locked = false;
        const doSubmit = async () =>
        {
            if (locked || isPaused)
            {
                return;
            }

            locked = true;
            input.disabled = true;
            submit.disabled = true;

            const got = normalizeAnswer(input.value,
            {
                caseSensitive,
                diacriticSensitive
            });
            const expected = normalizeAnswer(expectedRaw,
            {
                caseSensitive,
                diacriticSensitive
            });
            const isCorrect = (got === expected);

            setInputFeedback(isCorrect);

            // Let the browser paint the background before starting the audio

            await new Promise(requestAnimationFrame);

            if (!isCorrect)
            {
                gameState.wrongCount += 1;
                if (kvWrong) kvWrong.textContent = `${gameState.wrongCount} / ${gameState.maxWrong}`;
            }

            await playFeedback(isCorrect ? goodFb : badFb);
            completeAndAdvance();
        };

        submit.addEventListener("click", doSubmit);
        input.addEventListener("keydown", (e) =>
        {
            if (e.key === "Enter") doSubmit();
        });
    }

    // Split into "user-perceived characters" (graphemes) if possible

    function segmentGraphemes(str)
    {
        const s = String(str ?? "");
        try {
            if (window.Intl && Intl.Segmenter)
            {
                const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      
                return Array.from(seg.segment(s), x => x.segment);
            }
        } catch {}
  
        // Fallback: codepoints (OK, but less “user-friendly” for some emojis/ZWJ sequences)
  
        return Array.from(s);
    }

    // Keep exactly 1 "character" (grapheme), reject whitespace
    
    function sanitizeHangmanGuessDisplay(raw)
    {
        let s = String(raw ?? "");
        // Ignore leading whitespace (if the user pastes " a", we take "a")
  
        s = s.replace(/^\s+/u, "");
        const first = segmentGraphemes(s)[0] || "";
        if (!first) return "";
        if (/^\s+$/u.test(first)) return ""; // we don’t allow guessing a space
  
        return first;
    }

    async function render_hangman_simple(sceneId, manifestItem)
    {
        const
        {
            items
        } = await parseSceneFileFromManifest(manifestItem);

        const goodAudio = findItemByRole(items, "good_answer_audio");
        const badAudio = findItemByRole(items, "wrong_answer_audio");
        const answer = findItemByRole(items, "answer_to_guess");

        const expectedRaw = String(answer?.value ?? "");
        const caseSensitive = String(answer?.caseSensitive ?? answer?.["case-sensitive"]).toLowerCase() === "true";
        const diacriticSensitive = String(answer?.diacriticSensitive ?? answer?.["diacritic-sensitive"]).toLowerCase() === "true";

        const statuses = items.filter(it => /^hangman_status_\d+$/i.test(it.role)).sort((a, b) => parseInt(a.role.split("_").pop(), 10) - parseInt(b.role.split("_").pop(), 10));
        let statusIndex = 0;
        const maxStatus = statuses.length ? (statuses.length - 1) : 6;

        // For display, NFC is "cleaner" (avoids e + separate accent)

        const answerDisplayUnits = segmentGraphemes(String(expectedRaw ?? "").normalize("NFC"));

        // For comparison, apply the EGF rules (case/diacritics) unit by unit

        const answerCompareUnits = answerDisplayUnits.map(u =>
            normalizeAnswer(u, { caseSensitive, diacriticSensitive })
        );

        // What's guessable = non-whitespace AND non-empty once normalized

        const guessable = answerDisplayUnits.map((u, i) => {
            if (/^\s+$/u.test(u)) return false;
  
            return (answerCompareUnits[i] ?? "") !== "";
        });

        // Display state: "_" for guessable units, otherwise show as-is

        const revealed = answerDisplayUnits.map((u, i) => (guessable[i] ? "_" : u));

        // We store normalized guesses (to ignore duplicates under EGF comparison rules)

        const guessedNorm = new Set();

        // And a "prettified" version for the UI (first input)

        const guessedPretty = new Map();

        const wrap = document.createElement("div");
        wrap.className = "hangman";
        const right = document.createElement("div");
        right.className = "right";

        const statusImgHolder = document.createElement("div");

        const renderStatusImage = async () =>
        {
            statusImgHolder.innerHTML = "";

            if (statuses.length)
            {
                statusImgHolder.appendChild(await renderResource(statuses[Math.min(statusIndex, maxStatus)], "hangman_status"));
            }

            else
            {
                const ph = document.createElement("div");
                ph.className = "notice";
                ph.textContent = "No hangman_status_* images found; using text-only status.";
                statusImgHolder.appendChild(ph);
            }
        };

        await renderStatusImage();
        right.appendChild(statusImgHolder);

        const word = document.createElement("div");
        word.className = "word";

        // (optional) more readable rendering
        
        word.style.display = "flex";
        word.style.flexWrap = "wrap";
        word.style.gap = "10px";

        const renderWord = () =>
        {
            word.innerHTML = "";
            for (let i = 0; i < revealed.length; i++)
            {
                const span = document.createElement("span");
                span.textContent = revealed[i];
                span.style.minWidth = "14px";
                span.style.textAlign = "center";
                span.style.fontWeight = "900";
                word.appendChild(span);
            }
        };
        renderWord();
        right.appendChild(word);

        const hangmanPrompt = document.createElement("div");
        hangmanPrompt.className = "textBlock";
        hangmanPrompt.style.marginTop = "10px";
        hangmanPrompt.textContent = t("guessSecretWord");
        right.appendChild(hangmanPrompt);

        
        const used = document.createElement("div");
        used.className = "used";
        const renderUsed = () =>
        {
            const list = Array.from(guessedPretty.values());
            // simple sort
  
            list.sort((a, b) => String(a).localeCompare(String(b)));
            used.textContent = t("used", { list: list.join(", ") || "—" });
        };
        renderUsed();
        right.appendChild(used);

        const input = document.createElement("input");
        input.className = "textInput";
        input.placeholder = t("enterCharacter");
        input.autocomplete = "off";
        input.spellcheck = false;

        input.inputMode = "text";
        input.enterKeyHint = "done";

        input.autocapitalize = "off";
        input.autocorrect = "off";

        // Helpers (put right after the input)

        // Robust "first grapheme" (handles emojis/combined chars; safe fallback)

        function firstGrapheme(str)
        {
            const s = String(str ?? "");
            if (!s) return "";

            // Best: Intl.Segmenter

            try
            {
                if (window.Intl && Intl.Segmenter)
                {
                    const seg = new Intl.Segmenter(undefined,
                    {
                        granularity: "grapheme"
                    });
                    const it = seg.segment(s)[Symbol.iterator]().next();
                    return it && it.value ? it.value.segment : "";
                }
            }
            catch
            {}

            // Fallback: Array.from approximates codepoints

            try
            {
                return Array.from(s)[0] || "";
            }
            catch
            {}

            return s.charAt(0) || "";
        }

        /**
         * Sanitize to ONE letter.
         * - keeps only a single Unicode letter
         * - applies the same case/diacritic rules as gameplay
         *
         * If you want to FORBID typographic ligatures like "ﬁ", enable NFKC step below.
         */

        function sanitizeSingleLetter(raw)
        {
            let ch = firstGrapheme(raw).trim();
            if (!ch) return "";

            // OPTIONAL: forbid typographic ligatures (ﬁ, ﬂ, …)
            // If enabled: "ﬁ" -> "fi" (2 chars) => rejected below.
            // Uncomment to forbid.
            // ch = ch.normalize("NFKC");

            // Must be exactly 1 letter after optional normalization
            // (If NFKC turns it into 2 letters, it won't pass.)

            const one = firstGrapheme(ch);

            let isLetter = false;
            try
            {
                isLetter = !!one && /^\p{L}$/u.test(one);
            }
            catch
            {
                isLetter = !!one && /^[A-Za-zÀ-ÖØ-öø-ÿ]$/.test(one);
            }

            if (!isLetter) return "";

            return normalizeAnswer(one,
            {
                caseSensitive,
                diacriticSensitive
            });
        }

        input.addEventListener("input", () =>
        {
            input.value = sanitizeHangmanGuessDisplay(input.value);
        });

        input.addEventListener("beforeinput", (e) =>
        {
            // We only block insertions that wouldn't produce any guessable character
  
            if (e.data == null) return;
            const ch = sanitizeHangmanGuessDisplay(e.data);
            if (!ch) e.preventDefault();
        });

        input.addEventListener("paste", (e) =>
        {
            const text = (e.clipboardData || window.clipboardData)?.getData("text") || "";
            const ch = sanitizeHangmanGuessDisplay(text);
            e.preventDefault();
            input.value = ch || "";
        });

        const guessBtn = footerButton(t("guess"),
        {
            kind: "good"
        });
        const inRow = document.createElement("div");
        inRow.className = "inputRow";
        inRow.appendChild(input);
        inRow.appendChild(guessBtn);

        const clearGuessFeedback = () => {            
            inRow.classList.remove("picked", "is-correct", "is-wrong");
            input.classList.remove("picked", "is-correct", "is-wrong");
        };

        const setGuessFeedback = (ok) => {
            clearGuessFeedback();  
            input.classList.add("picked", ok ? "is-correct" : "is-wrong");
        };

        // When the user types a letter again, remove the previous feedback
        
        input.addEventListener("input", clearGuessFeedback);

        right.appendChild(inRow);

        wrap.appendChild(right);
        sceneContent.appendChild(wrap);

        let locked = false;

        const playOnce = async (audioItem) =>
        {
            if (!audioItem)
            {
                return;
            }

            const el = new Audio();
            el.src = await readZipBlobUrl(audioItem.hrefPath, audioItem.mediaType || "audio/mpeg");
            el.volume = fgMute.checked ? 0 : clamp01(audioState.fgUserVolume);
            attachMainMedia(el,
            {
                primary: false
            });
            applyForegroundMuteIfNeeded();

            try
            {
                if (!isPaused)
                {
                    await el.play();
                }
            }
            catch
            {

            }

            await new Promise(res => el.addEventListener("ended", res,
            {
                once: true
            }));
            stopAndRevoke(el);
        };

        const completeAndAdvance = () =>
        {
            if (shouldOverrideToGameOver())
            {
                lockGameplayProgressAtCurrentScene();

                return safeGoToSceneId(gameState.idGameOver);
            }

            safeGoNext();
        };

        const finish = async (win) =>
        {
            locked = true;
            input.disabled = true;
            guessBtn.disabled = true;

            completeAndAdvance();
        };

        const doGuess = async () => {
            if (locked || isPaused) return;

            const chDisplay = sanitizeHangmanGuessDisplay(input.value);
            
            if (!chDisplay) return;

            input.value = "";

            const chNorm = normalizeAnswer(chDisplay, { caseSensitive, diacriticSensitive });
  
            if (!chNorm) return;

            // Already guessed (according to EGF comparison) -> ignore, no penalty
    
            if (guessedNorm.has(chNorm)) return;

            guessedNorm.add(chNorm);
            if (!guessedPretty.has(chNorm)) guessedPretty.set(chNorm, chDisplay);
            renderUsed();

            let anyHit = false;

            for (let i = 0; i < answerCompareUnits.length; i++)
            {
                if (!guessable[i]) continue;

                if (answerCompareUnits[i] === chNorm) {
                    revealed[i] = answerDisplayUnits[i]; // reveal using the original form (diacritics/case)
                    anyHit = true;
                }
            }

            if (!anyHit)
            {
                gameState.wrongCount += 1;
                if (kvWrong) kvWrong.textContent = `${gameState.wrongCount} / ${gameState.maxWrong}`;

                statusIndex = Math.min(statusIndex + 1, maxStatus);
                await renderStatusImage();

                await new Promise(requestAnimationFrame);
                setGuessFeedback(false);
                await new Promise(requestAnimationFrame);

                await playOnce(badAudio);
                clearGuessFeedback();

                if (shouldOverrideToGameOver() )
                {
                    lockGameplayProgressAtCurrentScene();
      
                    return safeGoToSceneId(gameState.idGameOver);
                }

                if (statusIndex >= maxStatus)
                {
                    await finish(false);
      
                    return;
                }
            }
            
            else
            {
                renderWord();

                await new Promise(requestAnimationFrame);
                setGuessFeedback(true);
                await new Promise(requestAnimationFrame);

                await playOnce(goodAudio);
                clearGuessFeedback();

                // Win if there are no more "_" on guessable positions
                
                const won = revealed.every((v, i) => !guessable[i] || v !== "_");
                if (won)
                {
                    await finish(true);
      
                    return;
                }
            }
        };

        guessBtn.addEventListener("click", doGuess);
        input.addEventListener("keydown", (e) =>
        {
            if (e.key === "Enter") doGuess();
        });
    }

    async function render_game_title_simple(sceneId, manifestItem)
    {
        const
        {
            items
        } = await parseSceneFileFromManifest(manifestItem);
        const imgItem = findItemByRole(items, "game_title_image");
        const audItem = findItemByRole(items, "game_title_audio");

        if (imgItem)
        {
            sceneContent.appendChild(await renderResource(imgItem, "game_title_image"));
        }

        if (audItem)
        {
            const a = new Audio();
            a.loop = true;
            a.src = await readZipBlobUrl(audItem.hrefPath, audItem.mediaType || "audio/mpeg");
            a.volume = fgMute.checked ? 0 : clamp01(audioState.fgUserVolume);
            attachMainMedia(a,
            {
                primary: true
            });
            applyForegroundMuteIfNeeded();

            // "safe" play() + retries an unlock if needed

            let ok = await playSafe(a);

            if (!ok)
            {
                // Retry an unlock (in case the change event wasn't enough)

                await unlockAudio();
                ok = await playSafe(a);
            }

            // Optional: if still blocked, show a "Tap to enable audio" button

            if (!ok)
            {
                const hint              = document.createElement("div");
                hint.className          = "notice neutral";
                hint.style.marginTop    = "10px";

                const title = document.createElement("b");
                title.textContent =
                    I18N[currentLang]?.audioBlockedTitle ??
                    I18N.en.audioBlockedTitle ??
                    "Audio blocked";

                const text = document.createElement("div");
                text.className = "muted";
                text.style.marginTop = "6px";
                text.textContent =
                    I18N[currentLang]?.audioBlockedHint ??
                    I18N.en.audioBlockedHint ??
                    "The browser blocked autoplay. Click the button below to enable audio.";

                const actions = document.createElement("div");
                actions.className = "row";
                actions.style.marginTop = "10px";

                const retryBtn = footerButton(
                    I18N[currentLang]?.enableAudio ??
                    I18N.en.enableAudio ??
                    "Enable audio",
                    {
                        kind: "good",
                        onClick: async () =>
                        {
                            await unlockAudio();
                            const started = await playSafe(a);

                            if (started)
                            {
                                hint.remove();
                                applyBgDuckIfNeeded();
                            }
                        }
                    }
                );

                actions.appendChild(retryBtn);

                hint.appendChild(title);
                hint.appendChild(document.createElement("br"));
                hint.appendChild(text);
                hint.appendChild(actions);

                sceneContent.appendChild(hint);
            }
        }

        sceneFooter.appendChild(footerButton(t("start"),
        {
            kind: "good",
            onClick: () =>
            {
                if (isPaused) return;
                gameState.sessionActive = true;
                gameState.wrongCount = 0;
                kvWrong.textContent = "0";
                safeGoNext();
            }
        }));
        sceneFooter.appendChild(footerButton(t("credits"),
        {
            onClick: () =>
            {
                if (gameState.idCredits) safeGoToSceneId(gameState.idCredits);
            }
        }));
    }

    async function render_congratulations_simple(sceneId, manifestItem)
    {
        const
        {
            items
        } = await parseSceneFileFromManifest(manifestItem);
        const imgItem = findItemByRole(items, "congratulations_image");
        const audItem = findItemByRole(items, "congratulations_audio");

        if (imgItem)
        {
            sceneContent.appendChild(await renderResource(imgItem, "congratulations_image"));
        }

        const playAgainBtn = footerButton(t("playAgain"),
        {
            kind: "good",
            disabled: true,
            onClick: () =>
            {
                if (isPaused) return;
                gameState.sessionActive = false;
                gameState.wrongCount = 0;
                kvWrong.textContent = "0";
                if (gameState.idGameTitle) safeGoToSceneId(gameState.idGameTitle);
            }
        });
        sceneFooter.appendChild(playAgainBtn);
        sceneFooter.appendChild(footerButton(t("credits"),
        {
            onClick: () =>
            {
                if (gameState.idCredits) safeGoToSceneId(gameState.idCredits);
            }
        }));

        if (audItem)
        {
            const a = new Audio();
            a.src = await readZipBlobUrl(audItem.hrefPath, audItem.mediaType || "audio/mpeg");
            a.volume = fgMute.checked ? 0 : clamp01(audioState.fgUserVolume);
            attachMainMedia(a,
            {
                primary: true
            });
            applyForegroundMuteIfNeeded();

            try
            {
                if (!isPaused)
                {
                    await a.play();
                }
            }
            catch
            {

            }

            a.addEventListener("ended", () =>
            {
                playAgainBtn.disabled = false;
                applyBgDuckIfNeeded();
            });
        }
        else playAgainBtn.disabled = false;
    }

    async function render_game_over_simple(sceneId, manifestItem)
    {
        const
        {
            items
        } = await parseSceneFileFromManifest(manifestItem);
        const imgItem = findItemByRole(items, "game_over_image");
        const audItem = findItemByRole(items, "game_over_audio");
        if (imgItem)
        {
            sceneContent.appendChild(await renderResource(imgItem, "game_over_image"));
        }

        const playAgainBtn = footerButton(t("playAgain"),
        {
            kind: "good",
            disabled: true,
            onClick: () =>
            {
                if (isPaused) return;
                gameState.sessionActive = false;
                gameState.wrongCount = 0;
                kvWrong.textContent = "0";
                if (gameState.idGameTitle) safeGoToSceneId(gameState.idGameTitle);
            }
        });
        sceneFooter.appendChild(playAgainBtn);
        sceneFooter.appendChild(footerButton(t("credits"),
        {
            onClick: () =>
            {
                if (gameState.idCredits) safeGoToSceneId(gameState.idCredits);
            }
        }));

        if (audItem)
        {
            const a = new Audio();
            a.src = await readZipBlobUrl(audItem.hrefPath, audItem.mediaType || "audio/mpeg");
            a.volume = fgMute.checked ? 0 : clamp01(audioState.fgUserVolume);
            attachMainMedia(a,
            {
                primary: true
            });
            applyForegroundMuteIfNeeded();
            try
            {
                if (!isPaused) await a.play();
            }
            catch
            {}
            a.addEventListener("ended", () =>
            {
                playAgainBtn.disabled = false;
                applyBgDuckIfNeeded();
            });
        }
        else playAgainBtn.disabled = false;
    }

    async function render_credits_simple(sceneId, manifestItem)
    {
        const
        {
            items
        } = await parseSceneFileFromManifest(manifestItem);
        const fields = items.filter(it => it.role === "credit_field");
        const list = document.createElement("div");
        list.style.display = "grid";
        list.style.gap = "10px";

        for (const f of fields)
        {
            const label = (f.children.find(x => x.role === "label")?.inlineText || "").trim();
            const content = (f.children.find(x => x.role === "content")?.inlineText || "").trim();
            const card = document.createElement("div");
            card.style.border = "1px solid var(--borderSoft2)";
            card.style.borderRadius = "14px";
            card.style.background = "var(--surface2)";
            card.style.padding = "10px 12px";
            const l = document.createElement("div");
            l.style.fontWeight = "900";
            l.style.marginBottom = "4px";
            l.textContent = label || "—";

            const c = document.createElement("div");
            c.className = "textBlock";
            c.style.fontSize = "15px";
            c.style.opacity = ".95";
            c.textContent = content || "—";

            card.appendChild(l);
            card.appendChild(c);
            list.appendChild(card);
        }

        sceneContent.appendChild(list);
        sceneFooter.appendChild(footerButton(t("backToTitle"),
        {
            onClick: () =>
            {
                if (gameState.idGameTitle) safeGoToSceneId(gameState.idGameTitle);
            }
        }));
        sceneFooter.appendChild(footerButton(t("exit"),
        {
            onClick: () =>
            {
                try
                {
                    window.close();
                }
                catch
                {}
                alert(t("exitBlocked"));
            }
        }));
    }

    async function renderUnknownScene(sceneId, manifestItem)
    {
        const msg = document.createElement("div");
        msg.className = "notice warn";
        msg.innerHTML = `<b>Unknown scene role:</b> <code>${escapeHtml(manifestItem.role||"(none)")}</code><br><br><span class="muted">Rendering a generic fallback. You can skip to the next scene.</span>`;
        sceneContent.appendChild(msg);
        sceneFooter.appendChild(footerButton(t("skip"),
        {
            onClick: safeGoNext
        }));
    }

    async function renderCurrentScene()
    {
        sceneContent.innerHTML = "";
        sceneFooter.innerHTML = "";
        stopMainMedia();
        stopAllForegroundAudio();

        // Prevent blob URL leaks from previous scene (images, inline audio/video, etc.)

        revokeSceneObjectUrls();

        const sceneId = sequence[gameState.currentIndex];
        const manifestItem = manifestById.get(sceneId);

        updateHeaderIdentity();

        updateAboutUi();
        updateProgressUi();
        setNavButtons();

        await ensureBackgroundAudioForScene(gameState.currentIndex);

        if (manifestItem)
        {
            await playForegroundAudioForScene(sceneId);
        }
        
        else
        {
            stopAllForegroundAudio(); // safety (even if already stopped earlier)
        }

        if (!manifestItem)
        {
            const warn = document.createElement("div");
            warn.className = "notice warn";
            warn.textContent = `Scene "${sceneId}" is referenced in <sequence> but missing from <manifest>.`;
            sceneContent.appendChild(warn);
            sceneFooter.appendChild(footerButton(t("skip"),
            {
                onClick: safeGoNext
            }));

            return;
        }

        switch (manifestItem.role)
        {
            case "game_title_simple":
                await render_game_title_simple(sceneId, manifestItem);
                break;

            case "congratulations_simple":
                await render_congratulations_simple(sceneId, manifestItem);
                break;

            case "game_over_simple":
                await render_game_over_simple(sceneId, manifestItem);
                break;

            case "credits_simple":
                await render_credits_simple(sceneId, manifestItem);
                break;

            case "mcq_simple":
                await render_mcq_simple(sceneId, manifestItem);
                break;

            case "hangman_simple":
                await render_hangman_simple(sceneId, manifestItem);
                break;

            case "question_simple":
                await render_question_simple(sceneId, manifestItem);
                break;

            case "true_or_false_simple":
                await render_true_or_false_simple(sceneId, manifestItem);
                break;

            case "text_simple":
                await render_text_simple(manifestItem);
                break;

            case "image_simple":
                await render_image_simple(manifestItem);
                break;

            case "video_simple":
                await render_video_simple(manifestItem);
                break;

            case "audio_simple":
                await render_audio_simple(manifestItem);
                break;

            default:
                await renderUnknownScene(sceneId, manifestItem);
                break;
        }

        applyForegroundMuteIfNeeded();
        applyBgDuckIfNeeded();

        if (isPaused)
        {
            setSceneControlsDisabled(true);
            pauseAllMediaInDom();

            if (audioState.bg)
            {
                try
                {
                    audioState.bg.pause();
                }
                catch
                {}
            }
        }
    }

    function parseMetadata(coreDoc)
    {
        const md = coreDoc.querySelector("metadata");

        let title = "—",
            creator = "—",
            description = "—",
            date = "—";
        let modified = "—";

        if (md)
        {
            const titleEl = md.getElementsByTagName("dc:title")[0] || md.getElementsByTagName("title")[0];

            if (titleEl && titleEl.textContent.trim())
            {
                title = titleEl.textContent.trim();
            }

            const creatorEl = md.getElementsByTagName("dc:creator")[0] || md.getElementsByTagName("creator")[0];

            if (creatorEl && creatorEl.textContent.trim())
            {
                creator = creatorEl.textContent.trim();
            }

            const descEl = md.getElementsByTagName("dc:description")[0] || md.getElementsByTagName("description")[0];

            if (descEl && descEl.textContent.trim())
            {
                description = descEl.textContent.trim();
            }

            const dateEl = md.getElementsByTagName("dc:date")[0] || md.getElementsByTagName("date")[0];

            if (dateEl && dateEl.textContent.trim())
            {
                date = dateEl.textContent.trim();
            }

            const modifiedEl = md.querySelector('meta[property="dcterms:modified"]');

            if (modifiedEl)
            {
                const v = (modifiedEl.getAttribute("content") || modifiedEl.textContent || "").trim();

                if (v)
                {
                    modified = v;
                }
            }
        }

        meta = {
            title,
            creator,
            description,
            date,
            modified
        };
    }

    function updateHeaderIdentity()
    {
        sceneName.textContent = (meta?.title && meta.title !== "—") ? meta.title : "—";

        const creator = (meta?.creator && meta.creator !== "—") ? meta.creator : "—";
        sceneSub.textContent = t("createdBy",
        {
            name: creator
        });

        updateDocumentTitle();
    }

    function updateDocumentTitle()
    {
        const gameTitle = String(meta?.title || "").trim();

        if (gameTitle && gameTitle !== "—")
        {
            document.title = gameTitle;
        
            return;
        }

        document.title = t("appTitle");
    }

    function buildDownloadFileName()
    {
        const rawTitle = String(meta?.title || "").trim();
        const fallback = currentPackageFile?.name || "package.egf";

        if (!rawTitle || rawTitle === "—")
        {
            return fallback;
        }

        const safeTitle = rawTitle
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/[. ]+$/g, "");

        return `${safeTitle || "game"}.egf`;
    }

    function readU16LE(dv, o)
    {
        return dv.getUint16(o, true);
    }

    function readU32LE(dv, o)
    {
        return dv.getUint32(o, true);
    }

    function readAscii(bytes)
    {
        let s = "";
        for (let i = 0; i < bytes.length; i++)
        {
            s += String.fromCharCode(bytes[i]);
        }

        return s;
    }

    function findFirstLocalFileHeaderOffset(dv)
    {
        const SIG_LFH = 0x04034b50;
        const n = dv.byteLength;

        // Allow leading bytes (e.g., SFX stub). Find the first LFH signature

        for (let i = 0; i + 3 < n; i++)
        {
            if (readU32LE(dv, i) === SIG_LFH)
            {
                return i;
            }
        }

        return -1;
    }

    function validateSceneRootOrThrow(doc, expectedRootTag, scenePath)
    {
        const root = doc?.documentElement;

        if (!root || root.tagName !== expectedRootTag)
        {
            throw new Error(
                `Invalid ${expectedRootTag} scene (${scenePath}): root element MUST be <${expectedRootTag}> (found <${root?.tagName || "?"}>).`
            );
        }
    }

    function roleCount(items, role)
    {
        return items.filter(it => it.role === role).length;
    }

    function findByRole(items, role)
    {
        return items.find(it => it.role === role) || null;
    }

    function requireHrefAndAllowedMimeOrThrow(item, allowedMimes, label, scenePath)
    {
        if (!item)
        {
            throw new Error(`Invalid scene (${scenePath}): missing required item "${label}".`);
        }

        if (!item.hrefPath)
        {
            throw new Error(`Invalid scene (${scenePath}): "${label}" MUST reference an external resource via href.`);
        }

        const mt = String(item.mediaType || "").trim();

        if (!mt)
        {
            throw new Error(`Invalid scene (${scenePath}): "${label}" MUST have a media-type attribute.`);
        }

        if (!allowedMimes.includes(mt))
        {
            throw new Error(
                `Invalid scene (${scenePath}): "${label}" media-type "${mt}" is not allowed. Allowed: ${allowedMimes.join(", ")}.`
            );
        }
    }

    function forbidExtraRolesOrThrow(items, allowedRoles, scenePath, sceneRole)
    {
        const allowed = new Set(allowedRoles);
        const extras = items
            .map(it => it.role)
            .filter(r => r && !allowed.has(r));

        if (extras.length)
        {
            throw new Error(
                `Invalid ${sceneRole} scene (${scenePath}): contains unexpected item role(s): ${extras.map(x => `"${x}"`).join(", ")}.`
            );
        }
    }

    function validateGameTitleSimpleSceneOrThrow(items, scenePath)
    {
        const errors = [];

        // EXACT roles expected (strict)

        const allowedRoles = ["game_title_image", "game_title_audio"];

        try
        {
            forbidExtraRolesOrThrow(items, allowedRoles, scenePath, "game_title_simple");
        }
        catch (e)
        {
            errors.push(e.message);
        }

        if (items.length !== 2)
        {
            errors.push(`game_title_simple MUST contain exactly 2 <item> elements (found ${items.length}).`);
        }

        if (roleCount(items, "game_title_image") !== 1)
        {
            errors.push(`game_title_simple MUST contain exactly 1 game_title_image.`);
        }

        if (roleCount(items, "game_title_audio") !== 1)
        {
            errors.push(`game_title_simple MUST contain exactly 1 game_title_audio.`);
        }

        if (errors.length)
        {
            throw new Error(`Invalid game_title_simple scene (${scenePath}):\n` + errors.map(e => "• " + e).join("\n"));
        }

        const img = findByRole(items, "game_title_image");
        const aud = findByRole(items, "game_title_audio");

        requireHrefAndAllowedMimeOrThrow(img, ["image/png", "image/jpeg"], "game_title_image", scenePath);
        requireHrefAndAllowedMimeOrThrow(aud, ["audio/wav", "audio/ogg", "audio/mpeg"], "game_title_audio", scenePath);
    }

    function validateCongratulationsSimpleSceneOrThrow(items, scenePath)
    {
        const errors = [];

        const allowedRoles = ["congratulations_image", "congratulations_audio"];
        try
        {
            forbidExtraRolesOrThrow(items, allowedRoles, scenePath, "congratulations_simple");
        }
        catch (e)
        {
            errors.push(e.message);
        }

        if (items.length !== 2)
        {
            errors.push(`congratulations_simple MUST contain exactly 2 <item> elements (found ${items.length}).`);
        }

        if (roleCount(items, "congratulations_image") !== 1)
        {
            errors.push(`congratulations_simple MUST contain exactly 1 congratulations_image.`);
        }

        if (roleCount(items, "congratulations_audio") !== 1)
        {
            errors.push(`congratulations_simple MUST contain exactly 1 congratulations_audio.`);
        }

        if (errors.length)
        {
            throw new Error(`Invalid congratulations_simple scene (${scenePath}):\n` + errors.map(e => "• " + e).join("\n"));
        }

        const img = findByRole(items, "congratulations_image");
        const aud = findByRole(items, "congratulations_audio");

        requireHrefAndAllowedMimeOrThrow(img, ["image/png", "image/jpeg"], "congratulations_image", scenePath);
        requireHrefAndAllowedMimeOrThrow(aud, ["audio/wav", "audio/ogg", "audio/mpeg"], "congratulations_audio", scenePath);
    }

    function validateGameOverSimpleSceneOrThrow(items, scenePath)
    {
        const errors = [];

        const allowedRoles = ["game_over_image", "game_over_audio"];

        try
        {
            forbidExtraRolesOrThrow(items, allowedRoles, scenePath, "game_over_simple");
        }
        catch (e)
        {
            errors.push(e.message);
        }

        if (items.length !== 2)
        {
            errors.push(`game_over_simple MUST contain exactly 2 <item> elements (found ${items.length}).`);
        }

        if (roleCount(items, "game_over_image") !== 1)
        {
            errors.push(`game_over_simple MUST contain exactly 1 game_over_image.`);
        }

        if (roleCount(items, "game_over_audio") !== 1)
        {
            errors.push(`game_over_simple MUST contain exactly 1 game_over_audio.`);
        }

        if (errors.length)
        {
            throw new Error(`Invalid game_over_simple scene (${scenePath}):\n` + errors.map(e => "• " + e).join("\n"));
        }

        const img = findByRole(items, "game_over_image");
        const aud = findByRole(items, "game_over_audio");

        requireHrefAndAllowedMimeOrThrow(img, ["image/png", "image/jpeg"], "game_over_image", scenePath);
        requireHrefAndAllowedMimeOrThrow(aud, ["audio/wav", "audio/ogg", "audio/mpeg"], "game_over_audio", scenePath);
    }

    function validateMimetypeFirstOrThrow(arrayBuffer)
    {
        const dv = new DataView(arrayBuffer);
        const bytes = new Uint8Array(arrayBuffer);

        const off = findFirstLocalFileHeaderOffset(dv);

        if (off < 0 || dv.byteLength < off + 30)
        {
            throw new Error(
                'Invalid EGF package: could not locate a ZIP Local File Header. ' +
                'The package does not look like a valid ZIP archive.'
            );
        }

        // Local File Header layout (minimum 30 bytes)

        const compression = readU16LE(dv, off + 8);
        const nameLen = readU16LE(dv, off + 26);

        const nameStart = off + 30;
        const nameEnd = nameStart + nameLen;

        if (nameEnd > dv.byteLength)
        {
            throw new Error("Invalid ZIP: first entry filename exceeds file size.");
        }

        const fileName = readAscii(bytes.slice(nameStart, nameEnd));

        // mimetype MUST be placed first in the ZIP

        if (fileName !== "mimetype")
        {
            throw new Error(
                `Invalid EGF package: first ZIP entry must be "mimetype" (found "${fileName || "(empty)"}").`
            );
        }

        // mimetype MUST be STORED (not compressed)

        if (compression !== 0)
        {
            throw new Error(
                `Invalid EGF package: "mimetype" must be stored (compression method 0 / STORED). ` +
                `Found compression method=${compression}.`
            );
        }

        // Do NOT enforce:
        // - data descriptor bit
        // - exact comp/uncomp sizes
        // - reading/validating content here
        // Content is validated later via validateMimetypeOrThrow(zip).
    }

    function parseEgfVersion(raw)
    {
        const s = String(raw || "").trim();

        if (!s)
        {
            return {
                raw: "1.1",
                major: 1,
                minor: 1,
                valid: true
            };
        }

        const m = s.match(/^(\d+)\.(\d+)$/);

        if (!m)
        {
            return {
                raw: s,
                major: NaN,
                minor: NaN,
                valid: false
            };
        }

        const major = parseInt(m[1], 10);
        const minor = parseInt(m[2], 10);

        return {
            raw: s,
            major,
            minor,
            valid: Number.isFinite(major) && Number.isFinite(minor),
        };
    }

    async function loadPreloadedPackage()
    {
        try
        {
            sceneName.textContent = t("bootTitle");
            sceneSub.textContent = t("bootSub");
            updateDocumentTitle();
            sceneContent.innerHTML = `<div class="textBlock muted">${escapeHtml(t("bootHint"))}</div>`;
            sceneFooter.innerHTML = "";

            const response = await fetch(PRELOADED_EGF_URL, { cache: "no-store" });

            if (!response.ok)
            {
                throw new Error(
                    t("preloadFetchError", {
                        status: response.status,
                        url: PRELOADED_EGF_URL
                    })
                );
            }

            const blob = await response.blob();

            const inferredName = getFileNameFromUrl(response.url || PRELOADED_EGF_URL);

            const file = new File(
                [blob],
                inferredName,
                { type: blob.type || "application/egf+zip" }
            );

            await loadPackage(file);
        }
        catch (e)
        {
            showFatal(new Error(
                `${t("preloadLoadFailed")}\n\n${String(e?.message || e)}`
            ));
        }
    }

    function downloadCurrentPackage()
    {
        if (!currentPackageFile)
        {
            return;
        }

        const url = URL.createObjectURL(currentPackageFile);
        const a = document.createElement("a");

        a.href = url;
        a.download = buildDownloadFileName();
        a.style.display = "none";

        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() =>
        {
            try
            {
                URL.revokeObjectURL(url);
            }
            catch
            {

            }
        }, 1000);
    }

    async function loadPackage(file)
    {
        let zipStrictOk = true;
        let zipStrictErrorMsg = null;

        setWarnings([]);
        sceneContent.innerHTML = `<div class="textBlock muted">${escapeHtml(t("loading"))}</div>`;
        sceneFooter.innerHTML = "";
        sceneName.textContent = t("loading");
        sceneSub.textContent = "";

        isPaused = false;
        pendingNav = null;
        pauseSnapshot = null;
        document.body.classList.remove("paused");
        setBtnLabel(btnPause, "⏸", t("pause"));
        btnPause.classList.remove("pauseOn");

        stopMainMedia();
        stopAllForegroundAudio();

        if (audioState.bg)
        {
            stopAndRevoke(audioState.bg);
            audioState.bg = null;
            audioState.bgItemId = null;
        }

        // Revoke old cover URL and favicon, then hide/reset UI

        revokeCoverUrl();
        setCoverUrl(null);

        revokeFaviconUrl();
        setFaviconUrl(null);

        // Revoke any leftover scene object URLs from previous package/session

        revokeSceneObjectUrls();

        zip = null;
        corePath = null;
        currentPackageFile = null;
        setNavButtons();

        manifestById.clear();
        settingsRefs.clear();
        settingsRefCounts.clear();
        sequence = [];
        sceneIndexById.clear();

        meta = {
            title: "—",
            creator: "—",
            description: "—",
            date: "—",
            modified: "—"
        };

        updateDocumentTitle();

        gameState.sessionActive = false;
        gameState.wrongCount = 0;

        gameState.idGameTitle = null;
        gameState.idCongratulations = null;
        gameState.idGameOver = null;
        gameState.idCredits = null;
        gameState.coverItem = null;

        const buf = await file.arrayBuffer();

        // Strict test (EGF 1.1 packaging compliance)

        try
        {
            validateMimetypeFirstOrThrow(buf);
        }
        catch (e)
        {
            zipStrictOk = false;
            zipStrictErrorMsg = String(e?.message || e);
        }

        zip = await JSZip.loadAsync(buf);

        // Require the "mimetype" file to be present + have the exact contents

        await validateMimetypeOrThrow(zip);

        corePath = await locateCoreFile(zip);
        coreDir = dirname(corePath);

        const coreXml = await readZipText(corePath);
        const coreDoc = parseXml(coreXml);

        const egf = coreDoc.documentElement;

        if (egf.tagName !== "egf")
        {
            throw new Error("Core file root element is not <egf>.");
        }

        egfVersion = (egf.getAttribute("version") || "1.1").trim();

        const v = parseEgfVersion(egfVersion);
        let openMode = "egf11";

        if (!v.valid)
        {
            // Unparseable version => cautious attempt "as 1.1", without claiming it

            openMode = "attempt11";
            setWarnings([
                `⚠️ Unrecognized EGF version format "${egfVersion}".`,
                `Attempting to open it using EGF 1.1 rules (best effort).`
            ], true);
        }

        else if (v.major !== 1)
        {
            openMode = "unsupported";
        }

        else if (v.minor === 0)
        {
            openMode = "egf10";
        }

        else if (v.minor === 1)
        {
            openMode = "egf11";
        }

        else
        {
            openMode = "attempt11";
            setWarnings([
                `⚠️ EGF version "${egfVersion}" is newer than 1.1.`,
                `Attempting to open it using EGF 1.1 rules (unknown extensions may be ignored).`
            ], true);
        }

        isCompat10 = (openMode === "egf10");

        if (openMode === "unsupported")
        {
            throw new Error(
                `Unsupported EGF version "${egfVersion}". ` +
                `This reader supports EGF 1.0 and 1.1, and can attempt EGF 1.x > 1.1 as "best effort".`
            );
        }

        parseMetadata(coreDoc);
        updateHeaderIdentity();

        // Apply strict ZIP constraints for BOTH EGF 1.1 and EGF 1.0

        if ((openMode === "egf11" || openMode === "egf10") && !zipStrictOk)
        {
            throw new Error(
                `Invalid EGF ${egfVersion} package: ZIP container is not conforming.\n\n` +
                (zipStrictErrorMsg ? ("Details: " + zipStrictErrorMsg) :
                    'Details: "mimetype" is not the first STORED entry.')
            );
        }

        // For "attempt11" only, keep going but surface a warning if strict ZIP fails

        if (openMode === "attempt11" && !zipStrictOk)
        {
            const existing = (warningsBox?.textContent || "").trim();
            const existingLines = existing ? existing.split("\n") : [];
            setWarnings([
                ...existingLines,
                "⚠️ ZIP container is not strictly conforming (mimetype not first STORED entry).",
                zipStrictErrorMsg ? ("Details: " + zipStrictErrorMsg) : ""
            ].filter(Boolean), true);
        }

        const manifest = coreDoc.querySelector("manifest");

        if (!manifest)
        {
            throw new Error("Missing <manifest>.");
        }

        for (const el of Array.from(manifest.children).filter(x => x.tagName === "item"))
        {
            const it = {
                id: getAttr(el, "id"),
                role: getAttr(el, "role"),
                mediaType: getAttr(el, "media-type"),
                hrefRaw: getAttr(el, "href"),
                hrefPath: null,
                value: getAttr(el, "value"),
                enableNextAtStart: getAttr(el, "enable-next-button-at-start"),
                scopeFromId: getAttr(el, "scope-from"),
                scopeToId: getAttr(el, "scope-to"),
                sceneRef: getAttr(el, "scene-ref")
            };

            if (!it.id)
            {
                continue;
            }

            // Forbid duplicate manifest IDs (EGF 1.1 strict)

            if (manifestById.has(it.id))
            {
                throw new Error(
                    `Invalid EGF: duplicate <manifest> item id="${it.id}". ` +
                    `Manifest item ids MUST be unique.`
                );
            }

            if (it.hrefRaw)
            {
                it.hrefPath = resolveRelative(coreDir, it.hrefRaw);
            }

            manifestById.set(it.id, it);
        }

        // Enforce HREF + MIME constraints for supported manifest roles (EGF 1.1)

        for (const [id, it] of manifestById.entries())
        {
            const role = String(it?.role || "");
            const allowed = ROLE_MIME_RULES_MANIFEST[role];

            // Only enforce for roles we explicitly support (normative)

            if (!allowed)
            {
                continue;
            }

            // href is REQUIRED for all supported manifest roles
            // (Prevents invalid items like: role="image_simple" without href)

            if (!it.hrefPath)
            {
                throw new Error(
                    `Invalid EGF: manifest item id="${id}" role="${role}" MUST reference a ZIP file via href.`
                );
            }

            // media-type MUST be present and in the allowed list

            assertAllowedMediaType(
            {
                role,
                mediaType: it.mediaType,
                allowed,
                context: `manifest item id="${id}"`
            });

            // Optional clarity (kept, now redundant but explicit for scene xml roles)

            if (allowed.length === 1 && allowed[0] === "application/xml")
            {
                // already ensured by hrefPath + assertAllowedMediaType, but OK to keep
            }
        }

        validateSpecialScenesUniquenessInManifestOrThrow();

        const settings = coreDoc.querySelector("settings");

        // STRICT: <settings> is REQUIRED (EGF 1.1)

        if (!settings)
        {
            throw new Error('Invalid EGF: missing required <settings> element.');
        }

        for (const el of Array.from(settings.children).filter(x => x.tagName === "setting"))
        {
            const ref = getAttr(el, "ref");

            if (!ref)
            {
                continue;
            }

            settingsRefs.add(ref);

            // Count duplicates (must be exactly 1 for max_wrong_answers ref)

            settingsRefCounts.set(ref, (settingsRefCounts.get(ref) || 0) + 1);
        }

        // Reject settings refs that don't exist in the manifest

        for (const [ref, count] of settingsRefCounts.entries())
        {
            if (!manifestById.has(ref))
            {
                throw new Error(
                    `Invalid EGF: <settings> references unknown manifest id "${ref}" (count=${count}).`
                );
            }
        }

        const seq = coreDoc.querySelector("sequence");

        if (!seq)
        {
            throw new Error("Missing <sequence>.");
        }

        sequence = Array
            .from(seq.children)
            .filter(x => x.tagName === "scene")
            .map(x => (x.getAttribute("ref") || "").trim())
            .filter(Boolean);

        if (!sequence.length)
        {
            throw new Error("Empty <sequence>.");
        }

        // Validate <sequence> refs:
        // - EGF 1.1 strict: unique refs + every ref MUST exist in <manifest>
        // - EGF 1.0 compat: duplicates/unknown become warnings

        {
            const seen = new Set();
            const duplicateRefs = [];
            const unknownRefs = [];

            for (const id of sequence)
            {
                if (seen.has(id))
                {
                    duplicateRefs.push(id);
                }

                seen.add(id);

                if (!manifestById.has(id))
                {
                    unknownRefs.push(id);
                }
            }

            if (!isCompat10)
            {
                if (duplicateRefs.length)
                {
                    throw new Error(
                        `Invalid EGF: duplicate scene ref(s) in <sequence>: ` +
                        duplicateRefs.map(x => `"${x}"`).join(", ") +
                        ` (EGF 1.1 requires unique refs).`
                    );
                }

                if (unknownRefs.length)
                {
                    throw new Error(
                        `Invalid EGF: <sequence> references unknown manifest id(s): ` +
                        unknownRefs.map(x => `"${x}"`).join(", ") +
                        `. Every <scene ref="..."> MUST point to an <item id="..."> in <manifest> (EGF 1.1).`
                    );
                }
            }

            else
            {
                const warns = [];

                if (duplicateRefs.length)
                {
                    warns.push(
                        `⚠️ EGF 1.0 compatibility: duplicate scene ref(s) in <sequence>: ` +
                        duplicateRefs.map(x => `"${x}"`).join(", ")
                    );
                }

                if (unknownRefs.length)
                {
                    warns.push(
                        `⚠️ EGF 1.0 compatibility: <sequence> references unknown manifest id(s): ` +
                        unknownRefs.map(x => `"${x}"`).join(", ") +
                        `. These scenes will be shown as missing/skipable.`
                    );
                }

                if (warns.length)
                {
                    const existing = (warningsBox?.textContent || "").trim();
                    const existingLines = existing ? existing.split("\n") : [];
                    setWarnings([...existingLines, ...warns], true);
                }
            }
        }

        buildSceneIndexMap();
        findSpecialSceneIds();

        validateSequenceOrderOrThrow(
        {
            compat10: false
        });

        // Define gameplay progress range:
        // Start = first scene AFTER game_title
        // End   = congratulations (100%)

        const idxTitle = sceneIndexById.get(gameState.idGameTitle) ?? 0;
        const idxCongrats = sceneIndexById.get(gameState.idCongratulations) ?? (sequence.length - 1);

        gameState.gameplayStartIdx = Math.min(idxTitle + 1, sequence.length - 1);
        gameState.gameplayEndIdx = Math.max(gameState.gameplayStartIdx, idxCongrats);

        // Reset progress memory

        gameState.lastGameplayPct = 0;

        // STRICT: exactly one max_wrong_answers in manifest

        const maxWrongItems = Array.from(manifestById.values()).filter(it => it?.role === "max_wrong_answers");

        if (maxWrongItems.length !== 1)
        {
            throw new Error(
                `Invalid EGF: manifest MUST contain exactly one item with role="max_wrong_answers" (found ${maxWrongItems.length}).`
            );
        }

        const maxItem = maxWrongItems[0];

        if (!maxItem.id)
        {
            throw new Error('Invalid EGF: max_wrong_answers item is missing an id.');
        }

        // STRICT: exactly one <setting ref="..."> pointing to that id

        const refCount = settingsRefCounts.get(maxItem.id) || 0;

        if (refCount !== 1)
        {
            throw new Error(
                `Invalid EGF: <settings> MUST contain exactly one <setting ref="${maxItem.id}"> ` +
                `(found ${refCount}).`
            );
        }

        // STRICT: value must be int >= 1

        const parsed = parseInt(String(maxItem.value ?? "").trim(), 10);

        if (!Number.isFinite(parsed) || parsed < 1)
        {
            throw new Error(
                `Invalid EGF: max_wrong_answers value MUST be an integer >= 1 (got "${maxItem.value ?? ""}").`
            );
        }

        gameState.maxWrong = parsed;

        buildAudioSettings();

        // egf_cover displayed in header + About

        if (gameState.coverItem?.hrefPath)
        {
            try
            {
                const coverMimeType = gameState.coverItem.mediaType || "image/jpeg";

                const coverUrl = await readZipBlobUrl(
                    gameState.coverItem.hrefPath,
                    coverMimeType
                );

                const faviconUrl = await readZipBlobUrl(
                    gameState.coverItem.hrefPath,
                    coverMimeType
                );

                // setCoverUrl / setFaviconUrl remove the URL from scene tracking
                // and properly revoke the previous value.

                setCoverUrl(coverUrl, meta?.title || "");
                setFaviconUrl(faviconUrl, coverMimeType);
            }

            catch
            {
                setCoverUrl(null);
                setFaviconUrl(null);
            }
        }

        else
        {
            setCoverUrl(null);
            setFaviconUrl(null);
        }

        if (openMode === "egf10")
        {
            modeLabel = `EGF ${egfVersion} (compat)`;
        }

        if (openMode === "attempt11")
        {
            modeLabel = `EGF ${egfVersion} (attempt as 1.1)`;
        }

        updateAboutUi();

        currentPackageFile = file;

        gameState.currentIndex = sceneIndexById.get(gameState.idGameTitle) ?? 0;
        setNavButtons();
        updateProgressUi();
        await renderCurrentScene();
    }

    function isModalOpen(modal)
    {
        return !!modal?.classList.contains("open");
    }

    function syncModalBodyState()
    {
        const anyOpen = [aboutModal, settingsModal, scoreModal].some(isModalOpen);
        document.body.classList.toggle("modalOpen", anyOpen);
    }

    function closeModal(modal)
    {
        if (!modal)
        {
            return;
        }

        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        syncModalBodyState();
    }

    function openModal(modal)
    {
        if (!modal)
        {
            return;
        }
        
        // Ensures that only one modal is open at a time

        [aboutModal, settingsModal, scoreModal].forEach(m =>
        {
            if (m !== modal)
            {
                m.classList.remove("open");
                m.setAttribute("aria-hidden", "true");
            }
        });

        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        syncModalBodyState();
    }

    function closeAllModals()
    {
        [aboutModal, settingsModal, scoreModal].forEach(modal =>
        {
            modal.classList.remove("open");
            modal.setAttribute("aria-hidden", "true");
        });

        syncModalBodyState();
    }

    function openAbout()
    {
        openModal(aboutModal);
    }

    function closeAbout()
    {
        closeModal(aboutModal);
    }

    btnAbout.addEventListener("click", openAbout);
    btnCloseAbout.addEventListener("click", closeAbout);
    aboutBackdrop.addEventListener("click", closeAbout);

    function openScore()
    {
        updateAboutUi();
        updateProgressUi();
        openModal(scoreModal);
    }

    function closeScore()
    {
        closeModal(scoreModal);
    }

    btnScore.addEventListener("click", openScore);
    btnCloseScore.addEventListener("click", closeScore);
    scoreBackdrop.addEventListener("click", closeScore);

    function openSettings()
    {
        openModal(settingsModal);
    }

    function closeSettings()
    {
        closeModal(settingsModal);
    }

    btnSettings.addEventListener("click", openSettings);
    btnCloseSettings.addEventListener("click", closeSettings);
    settingsBackdrop.addEventListener("click", closeSettings);

    document.addEventListener("keydown", (e) =>
    {
        if (e.key !== "Escape")
        {
            return;
        }

        closeAllModals();
    });

    btnReset.addEventListener("click", async () =>
    {
        if (!zip)
        {
            return;
        }

        // Display a warning if a game is already in progress

        if (gameState.sessionActive)
        {
            const ok = confirm(t("confirmReset"));

            if (!ok)
            {
                return;
            }
        }

        closeSettings();
        closeAbout();

        if (isPaused)
        {
            pauseSnapshot = null;
            pendingNav = null;
            await setPaused(false);
        }

        gameState.sessionActive = false;
        gameState.wrongCount = 0;
        kvWrong.textContent = "0";
        gameState.lastGameplayPct = 0;

        goToSceneId(gameState.idGameTitle || sequence[0]);
    });

    // Pause

    btnPause.addEventListener("click", async () =>
    {
        if (!zip) return;
        await setPaused(!isPaused);
    });
    btnResumeOverlay.addEventListener("click", async () =>
    {
        if (!zip) return;
        await setPaused(false);
    });

    btnDownloadEgf?.addEventListener("click", downloadCurrentPackage);

    // Settings events

    bgMute.addEventListener("change", () =>
    {
        applyBgDuckIfNeeded();

        if (!isPaused && audioState.bg && !bgMute.checked && audioState.bg.paused && !audioState.bgPausedForPrimary)
        {
            try
            {
                audioState.bg.play();
            }
            catch
            {}
        }
    });
    fgMute.addEventListener("change", () =>
    {
        applyForegroundMuteIfNeeded();
        applyBgDuckIfNeeded();
    });

    updateVolumeLabels();
    audioState.bgUserVolume = clamp01(parseInt(bgVol.value, 10) / 100);
    audioState.fgUserVolume = clamp01(parseInt(fgVol.value, 10) / 100);

    bgVol.addEventListener("input", () =>
    {
        audioState.bgUserVolume = clamp01(parseInt(bgVol.value, 10) / 100);
        updateVolumeLabels();
        applyBgDuckIfNeeded();
    });
    fgVol.addEventListener("input", () =>
    {
        audioState.fgUserVolume = clamp01(parseInt(fgVol.value, 10) / 100);
        updateVolumeLabels();
        applyForegroundMuteIfNeeded();
        applyBgDuckIfNeeded();
    });

    updateAboutUi();

    const themeToggle = document.getElementById("themeToggle");
    const themeLabel = themeToggle?.parentElement?.querySelector("span");

    function applyTheme(mode)
    {
        // "dark" = checkbox CHECKED; "light" = checkbox UNCHECKED

        if (mode === "dark")
        {
            // Dark = default theme (without data-theme="light")

            document.documentElement.removeAttribute("data-theme");
            themeToggle.checked = true;

            if (themeLabel) themeLabel.textContent = t("darkMode");
        }
        else
        {
            // Light = data-theme="light"

            document.documentElement.setAttribute("data-theme", "light");
            themeToggle.checked = false;

            if (themeLabel) themeLabel.textContent = t("darkMode");
        }
        syncScoreProgressGradient();
    }

    (function initTheme()
    {
        const saved = localStorage.getItem("theme");

        if (saved === "light" || saved === "dark")
        {
            applyTheme(saved);
        
            return;
        }

        const configured = APP_CONFIG.defaultTheme;

        if (configured === "light" || configured === "dark")
        {
            applyTheme(configured);
        
            return;
        }

        const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
    
        applyTheme(prefersLight ? "light" : "dark");
    })();

    (function initLanguage()
    {
        const allowed = new Set(Object.keys(I18N));

        const saved = (localStorage.getItem("lang") || "").trim();

        if (saved && allowed.has(saved))
        {
            if (langSelect) langSelect.value = saved;
            applyLanguage(saved,
            {
                persist: false
            });
        
            return;
        }

        const configured = String(APP_CONFIG.defaultLang || "").trim().toLowerCase();

        if (configured && configured !== "auto" && allowed.has(configured))
        {
            if (langSelect) langSelect.value = configured;
            applyLanguage(configured,
            {
                persist: false
            });
        
            return;
        }

        const prefs = Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages
            : [navigator.language || ""];

        function normalizeLocaleToAppLang(locale)
        {
            const raw = String(locale || "").trim();

            if (!raw)
            {
                return null;
            }

            return raw.toLowerCase().split(/[-_]/)[0];
        }

        let picked = null;

        for (const loc of prefs)
        {
            const exact = String(loc || "").trim().toLowerCase();

            if (allowed.has(exact))
            {
                picked = exact;
            
                break;
            }
        }

        if (!picked)
        {
            for (const loc of prefs)
            {
                const base = normalizeLocaleToAppLang(loc);

                if (base && allowed.has(base))
                {
                    picked = base;
                
                    break;
                }
            }
        }

        if (!picked || !allowed.has(picked))
        {
            picked = "en";
        }

        if (langSelect) langSelect.value = picked;
    
        applyLanguage(picked,
        {
            persist: false
        });
    })();

    if (langSelect)
    {
        langSelect.addEventListener("change", () =>
        {
            applyLanguage(langSelect.value,
            {
                persist: true
            });
        });
    }

    themeToggle.addEventListener("change", () =>
    {
        const mode = themeToggle.checked ? "dark" : "light";
        applyTheme(mode);
        localStorage.setItem("theme", mode);
    });

    function t(key, vars = {})
    {
        const dict = I18N[currentLang] || I18N.en;
        let s = dict[key] ?? I18N.en[key] ?? key;
        for (const k of Object.keys(vars))
        {
            s = s.replaceAll(`{${k}}`, String(vars[k]));
        }
        return s;
    }

    function applyLanguage(lang,
    {
        persist = true
    } = {})
    {
        const allowed = new Set(Object.keys(I18N));
        currentLang = allowed.has(lang) ? lang : "en";
        const langHint = $("langHint");

        // Don't write to localStorage unless it's an explicit choice

        if (persist)
        {
            localStorage.setItem("lang", currentLang);
        }

        // Document title + footer branding

        updateDocumentTitle();

        if (poweredBy)
        {
            poweredBy.textContent = t("poweredBy", { name: t("appTitle") });
        }
        
        btnPause.title = t("pauseTitle");
        btnScore.title = t("scoreTitle");
        btnAbout.title = t("aboutTitle");
        btnSettings.title = t("settingsTitle");

        // Button labels (header)

        setBtnLabel(btnPause, isPaused ? "▶" : "⏸", isPaused ? t("resume") : t("pause"));
        setBtnLabel(btnScore, "🏆", t("score"));
        setBtnLabel(btnAbout, "ℹ️", t("about"));
        setBtnLabel(btnSettings, "⚙️", t("settings"));

        // Pause overlay

        const pTitle = pauseOverlay.querySelector("h3");
        const pDesc = pauseOverlay.querySelector("p");
        if (pTitle) pTitle.textContent = t("pausedTitle");
        if (pDesc) pDesc.textContent = t("pausedDesc");
        btnResumeOverlay.textContent = t("resume");

        // Role pill title

        rolePill.title = t("rolePillTitle");

        // Settings: static labels

        langLabel.textContent = t("langName");
        if (langHint) langHint.textContent = t("langHint");

        if (langSelect)
        {
            // Map: <option value="..."> value -> corresponding i18n key

            const LANG_LABEL_KEYS = {
                en: "langEN",
                fr: "langFR",
                es: "langES",
                pt: "langPT",
                hi: "langHI",
                zh: "langZH",
                ar: "langAR",
                ur: "langUR",
                ru: "langRU",
            };

            for (const [value, key] of Object.entries(LANG_LABEL_KEYS))
            {
                const opt = langSelect.querySelector(`option[value="${value}"]`);
                if (opt) opt.textContent = t(key);
            }
        }

        // Settings rows (by walking DOM in modal: robust even if you reorder)

        const settingsRows = settingsModal.querySelectorAll(".settingsRow");

        if (settingsRows[0])
        {
            settingsRows[0].querySelector(".left .name").textContent = t("bgVolName");
            settingsRows[0].querySelector(".left .hint").textContent = t("bgVolHint");
            const muteSpan = settingsRows[0].querySelector(".toggle span");
            if (muteSpan) muteSpan.textContent = t("mute");
        }

        if (settingsRows[1])
        {
            settingsRows[1].querySelector(".left .name").textContent = t("fgVolName");
            settingsRows[1].querySelector(".left .hint").textContent = t("fgVolHint");
            const muteSpan = settingsRows[1].querySelector(".toggle span");
            if (muteSpan) muteSpan.textContent = t("mute");
        }

        if (settingsRows[2])
        {
            settingsRows[2].querySelector(".left .name").textContent = t("themeName");
            settingsRows[2].querySelector(".left .hint").textContent = t("themeHint");
            // the toggle label is updated in applyTheme()
        }

        // Row 4: language is handled above
        // Row 5: reset (after language)
        // Depending on your exact structure, reset may now be index 4 or 5:

        const resetRow = Array.from(settingsRows).find(r => r.querySelector("#btnReset"));
        if (resetRow)
        {
            resetRow.querySelector(".left .name").textContent = t("resetName");
            resetRow.querySelector(".left .hint").textContent = t("resetHint");
            btnReset.textContent = t("reset");
            btnReset.title = t("resetTitle");
        }

        const downloadRow = $("aboutDownloadRow");
        if (downloadRow)
        {
            downloadRow.querySelector(".left .name").textContent = t("downloadName");
            downloadRow.querySelector(".left .hint").textContent = t("downloadHint");
            btnDownloadEgf.textContent = t("downloadEgf");
            btnDownloadEgf.title = t("downloadTitle");
        }

        // Modal headers

        aboutModal.querySelector(".panelHd .title span").textContent = t("about");
        settingsModal.querySelector(".panelHd .title span").textContent = t("settings");
        scoreModal.querySelector(".panelHd .title span").textContent = t("score");

        btnCloseAbout.textContent = t("close");
        btnCloseSettings.textContent = t("close");
        btnCloseScore.textContent = t("close");

        // ARIA labels (optional but nice)

        aboutModal.querySelector(".panel").setAttribute("aria-label", t("aboutAria"));
        settingsModal.querySelector(".panel").setAttribute("aria-label", t("settingsAria"));
        scoreModal.querySelector(".panel").setAttribute("aria-label", t("scoreAria"));

        // About KV labels (left column = .k)

        const aboutKv = aboutModal.querySelectorAll(".kv .k");
        if (aboutKv.length >= 6)
        {
            aboutKv[0].textContent = t("aboutGameName");
            aboutKv[1].textContent = t("aboutCreator");
            aboutKv[2].textContent = t("aboutDesc");
            aboutKv[3].textContent = t("aboutDate");
            aboutKv[4].textContent = t("aboutModified");
            aboutKv[5].textContent = t("aboutVer");
        }

        // Score KV labels

        const scoreKv = scoreModal.querySelectorAll(".kv .k");

        if (scoreKv.length >= 5)
        {
            scoreKv[0].textContent = t("scoreCurrentScene");
            scoreKv[1].textContent = t("scoreCurrentSceneId");
            scoreKv[2].textContent = t("scoreCurrentRole");
            scoreKv[3].textContent = t("scoreWrong");
            scoreKv[4].textContent = t("scoreProgress");
        }

        // Header empty state or "created by"

        if (!zip)
        {
            sceneName.textContent   = t("bootTitle");
            sceneSub.textContent    = t("bootSub");
            sceneContent.innerHTML  = `<div class="textBlock muted">${escapeHtml(t("bootHint"))}</div>`;
        }

        else
        {
            updateHeaderIdentity();
        }

        // Update theme label string (depends on current language)

        const currentTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
        applyTheme(currentTheme);
    }

    syncResponsiveHeader();

    if (mobileHeaderMq.addEventListener)
    {
        mobileHeaderMq.addEventListener("change", syncResponsiveHeader);
    }
    else if (mobileHeaderMq.addListener)
    {
        mobileHeaderMq.addListener(syncResponsiveHeader);
    }

    loadPreloadedPackage();

})();
