let currentVideoId = "";
let stateCheckInterval = null;
let playtimeTicker = null;
let toastTicker = null;

let localWatchTime = 0;
let isThresholdMet = false;

let isCommentsPurchased = false;
let commentsUnlockTimer = null;

let resumeCheckInterval = null;

function getYouTubeId(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.pathname.startsWith("/watch")) return urlObj.searchParams.get("v");
    if (urlObj.pathname.startsWith("/shorts/")) {
      const parts = urlObj.pathname.split("/");
      return parts[parts.length - 1];
    }
  } catch (e) { return null; }
  return null;
}

// Helper function to format timestamp into human time (e.g., "11:42 AM")
function formatResetTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function injectBlockElement(resetTime) {

  const videoElement = document.querySelector("video");
  if (videoElement && videoElement.currentTime > 0) {
    sessionStorage.setItem("yt_resume_time", videoElement.currentTime);
  }

  const targets = ["ytd-player", "#player-theater-container", "ytd-shorts", "#shorts-container"];
  targets.forEach(selector => {
    const element = document.querySelector(selector);
    if (element && !element.hasAttribute('data-limit-reached')) {
      element.innerHTML = "";
      element.setAttribute('data-limit-reached', 'true');
      
      const blockBanner = document.createElement("div");
      blockBanner.style.cssText = `
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        width: 100%; height: 400px; background-color: #111; color: #ff4444;
        font-family: Arial, sans-serif; font-size: 24px; font-weight: bold;
        border: 2px solid #ff4444; border-radius: 8px; text-align: center; gap: 8px;
      `;
      blockBanner.innerHTML = `
        <div>⚠️ Playtime Limit Reached ⚠️</div>
        <div style="font-size: 14px; color: #aaa;">
          Your allowed streaming time has run out.
        </div>
        <div style="font-size: 16px; color: #2ecc71; margin-top: 5px; font-weight: normal;">
          🔄 Next Reset: <strong>${formatResetTime(resetTime)}</strong>
        </div>
      `;
      element.appendChild(blockBanner);
    }
  });
}

function showThresholdToast(initialRemaining, resetTime) {
  let toast = document.getElementById('yt-limiter-toast');

  if (!chrome.runtime || !chrome.runtime.id) {
    if (toastTicker) clearInterval(toastTicker);
    if (toast) toast.remove();
    return; 
  }
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'yt-limiter-toast';
    toast.style.cssText = `
      position: fixed; top: 80px; right: 20px; background-color: #0f0f0f; color: #ffffff;
      border-left: 5px solid #ff0000; padding: 12px 18px; border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6); font-family: Arial, sans-serif;
      font-size: 13px; z-index: 99999; display: flex; flex-direction: column; gap: 6px;
    `;
    document.body.appendChild(toast);
  }

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  toast.innerHTML = `
    <div><strong style="color: #ff0000;">⏳ Tracking Playtime:</strong></div>
    <div style="font-size: 18px; font-weight: bold; margin: 2px 0;">
      Time Left: <span id="toast-timer">${formatTime(initialRemaining)}</span>
    </div>
    <div style="font-size: 11px; color: #aaa;" id="toast-reset-label">🔄 Resets at ${formatResetTime(resetTime)}</div>
    
    <button id="toast-unlock-btn" style="
      margin-top: 4px; background-color: #2c3e50; color: #ffffff; border: none;
      padding: 6px 10px; font-weight: bold; border-radius: 4px; cursor: pointer;
      font-size: 11px; transition: background-color 0.2s;
    ">🔓 Unlock Comments</button>
  `;

  const unlockBtn = document.getElementById('toast-unlock-btn');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', () => {
      if (!chrome.runtime || !chrome.runtime.id) return;

      chrome.runtime.sendMessage({ action: "purchaseComments" }, (response) => {
        if (chrome.runtime.lastError) return;
        
        if (response && response.success) {
          showCommentsSection(response.commentAllowed * 1000); 
          
          unlockBtn.textContent = "✅ Comments Unlocked";
          unlockBtn.style.backgroundColor = "#2ecc71";
          unlockBtn.disabled = true;
        } else if (response && !response.success) {
          unlockBtn.textContent = "❌ Not Enough Time!";
          unlockBtn.style.backgroundColor = "#e74c3c";
          setTimeout(() => {
            unlockBtn.textContent = "🔓 Unlock Comments";
            unlockBtn.style.backgroundColor = "#2c3e50";
          }, 2000);
        }
      });
    });
  }


  if (toastTicker) clearInterval(toastTicker);
  toastTicker = setInterval(() => {
    if (!chrome.runtime || !chrome.runtime.id) {
      clearInterval(toastTicker);
      return;
    }
        if (!isCommentsPurchased) {
          const unlockBtn = document.getElementById('toast-unlock-btn');
      unlockBtn.textContent = "🔓 Unlock Comments";
      unlockBtn.style.backgroundColor = "#2c3e50";
      unlockBtn.disabled = false;
        }
    chrome.runtime.sendMessage({ action: "checkTimeAllowance" }, (response) => {
      if (chrome.runtime.lastError) {
        clearInterval(toastTicker);
        return;
      }
      if (response) {
        const timerSpan = document.getElementById('toast-timer');
        const resetLabel = document.getElementById('toast-reset-label');
        
        if (timerSpan) timerSpan.textContent = formatTime(response.remaining);
        if (resetLabel) resetLabel.innerHTML = `🔄 Resets at ${formatResetTime(response.nextResetAt)}`;
        
        if (response.remaining <= 0) {
          clearInterval(toastTicker);
          const activeToast = document.getElementById('yt-limiter-toast');
          if (activeToast) activeToast.remove();
        }
      }
    });
  }, 1000);
}

function getActiveVideoElement() {
  const allVideos = document.querySelectorAll("video");
  
  if (allVideos.length === 1) return allVideos[0];
  
  for (let video of allVideos) {
    if (
      video && 
      !video.paused &&
      video.currentTime > 0 &&
      video.offsetWidth > 0 &&
      video.offsetHeight > 0
    ) {
      return video;
    }
  }
  
  const activeShortContainer = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer:not([aria-hidden="true"])');
  if (activeShortContainer) {
    const shortVideo = activeShortContainer.querySelector("video");
    if (shortVideo) return shortVideo;
  }
  
  return document.querySelector("video");
}

function startPlaytimeTicker() {
   if (playtimeTicker) return;

  playtimeTicker = setInterval( () => {
    const videoElement = getActiveVideoElement();
    if (!videoElement) return;
    if (videoElement && videoElement.paused) return;
      if (!chrome.runtime || !chrome.runtime.id) {
        clearInterval(playtimeTicker);
        return;
      }

      chrome.runtime.sendMessage({ action: "checkTimeAllowance" }, (response) => {

        if (!response) return;

        if (response.remaining <= 0) {
          injectBlockElement(response.nextResetAt);
          stopPlaytimeTicker();
          return;
        }

        if (!isThresholdMet) {
          localWatchTime++;
          if (localWatchTime >= 10) {
            isThresholdMet = true;
            chrome.runtime.sendMessage({ action: "addPlaytime", seconds: 10 });
            showThresholdToast(response.remaining - 10, response.nextResetAt); 
          }
        } else {
          chrome.runtime.sendMessage({ action: "addPlaytime", seconds: 1 });
        }
      });
  }, 1000);
}

function stopPlaytimeTicker() {
  if (playtimeTicker) clearInterval(playtimeTicker);
  playtimeTicker = null;
  if (toastTicker) clearInterval(toastTicker);
  const toast = document.getElementById('yt-limiter-toast');
  if (toast) toast.remove();

  isCommentsPurchased = false;
  if (commentsUnlockTimer) {
    clearTimeout(commentsUnlockTimer);
    commentsUnlockTimer = null;
  }

  localWatchTime = 0;
  isThresholdMet = false;
}

function showCommentsSection(durationMs = 5 * 60 * 1000) {
  isCommentsPurchased = true; 

  const shortsActionContainers = document.querySelectorAll(".ytReelPlayerOverlayViewModelActionsContainer");
  shortsActionContainers.forEach(container => {
    const itemElements = container.querySelectorAll("button-view-model");
    if (itemElements && itemElements.length > 0) {
      const commentButtonWrapper = itemElements[1];
      if (commentButtonWrapper && commentButtonWrapper.style.display === "none") {
        commentButtonWrapper.style.display = ""; 
      }
    }
  });

  const regularCommentSelectors = ["#comments", "ytd-comments", "#comment-section-renderer"];
  regularCommentSelectors.forEach(selector => {
    const commentsEl = document.querySelector(selector);
    if (commentsEl) {
      commentsEl.style.display = "";
      commentsEl.style.visibility = "";
    }
  });

  if (commentsUnlockTimer) clearTimeout(commentsUnlockTimer);

  commentsUnlockTimer = setTimeout(() => {
    isCommentsPurchased = false;
    hideCommentsSection();
    commentsUnlockTimer = null;
  }, durationMs);
}

function hideCommentsSection() {
  if (typeof isCommentsPurchased !== 'undefined' && isCommentsPurchased) return;

  let retryCount = 0;
  const maxRetries = 10;

  let buttonHiddenSuccess = false;
  let panelClosedSuccess = false;
  let watchCommentsSuccess = false;

  const attemptHide = () => {
    if (window.location.href.includes("/watch")) {
      const regularCommentSelectors = ["#comments", "ytd-comments", "#comment-section-renderer"];
      regularCommentSelectors.forEach(selector => {
        const commentsEl = document.querySelector(selector);
        if (commentsEl) {
          commentsEl.style.display = "none";
          commentsEl.style.visibility = "hidden";
          watchCommentsSuccess = true;
        }
      });

      if (!watchCommentsSuccess && retryCount < maxRetries) {
        retryCount++;
        setTimeout(attemptHide, 200);
      }
      return;
    }

    const shortsActionContainers = document.querySelectorAll(".ytReelPlayerOverlayViewModelActionsContainer");
    shortsActionContainers.forEach(container => {
      const itemElements = container.querySelectorAll("button-view-model");
      if (itemElements && itemElements.length > 1) {
        const commentButtonWrapper = itemElements[1];
        if (commentButtonWrapper.style.display === "none") {
          buttonHiddenSuccess = true;
        } else {
          commentButtonWrapper.style.display = "none";
          buttonHiddenSuccess = true;
        }
      }
    });

    const openShortsPanels = document.querySelectorAll("ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-comments-section'][visibility='ENGAGEMENT_PANEL_VISIBILITY_EXPANDED']");
    if (openShortsPanels.length === 0) {
      panelClosedSuccess = true;
    } else {
      openShortsPanels.forEach(panel => {
        const closeButton = panel.querySelector("#visibility-button button, ytd-button-renderer#visibility-button");
        if (closeButton) {
          closeButton.click();
          panelClosedSuccess = true;
        } else {
          panel.style.display = "none";
          panel.removeAttribute("visibility");
          panelClosedSuccess = true;
        }
      });
    }

    const shortsDefensesReady = buttonHiddenSuccess && panelClosedSuccess;

    if (!shortsDefensesReady && retryCount < maxRetries) {
      retryCount++;
      setTimeout(attemptHide, 200);
    }
  };

  attemptHide();
}

function removeBlockElement() {
  const targets = ["ytd-player", "#player-theater-container", "ytd-shorts", "#shorts-container"];
  let removed = false;

  targets.forEach(selector => {
    const element = document.querySelector(selector);
    if (element && element.hasAttribute('data-limit-reached')) {
      element.removeAttribute('data-limit-reached');
      removed = true;
    }
  });

  // If a block was active, we reload the page or force YouTube to re-render the player state
  if (removed) {
    location.reload(); // Cleanest way to force YouTube SPA to rebuild the player pipeline
  }

}

function startURLTracking() {
  if (stateCheckInterval) clearInterval(stateCheckInterval);

  stateCheckInterval = setInterval( () => {

    const id = getYouTubeId(window.location.href);

    // SAFELY CHECK CONTEXT BEFORE SENDING MESSAGE
    if (!chrome.runtime || !chrome.runtime.id) {
      clearInterval(stateCheckInterval);
      stopPlaytimeTicker();
      return;
    }

    
    if (id && id !== currentVideoId) {
      currentVideoId = id;
      stopPlaytimeTicker();
      if (resumeCheckInterval) clearInterval(resumeCheckInterval);
      resumeCheckInterval = null;
      chrome.runtime.sendMessage({ action: "checkTimeAllowance" }, (response) => {
        if (chrome.runtime.lastError) return;
	if (!response) return;
        if (response && response.remaining <= 0) {
          injectBlockElement(response.nextResetAt);
        } else {
    	  hideCommentsSection();
          startPlaytimeTicker();
        }
      });
    } else if (id) {
      chrome.runtime.sendMessage({ action: "checkTimeAllowance" }, (response) => {
        if (chrome.runtime.lastError) return;
	if (!response) return;
        if (response && response.remaining > 0) {
          const isCurrentlyBlocked = document.querySelector('[data-limit-reached="true"]');
          if (isCurrentlyBlocked) {
            removeBlockElement();
          }
	}
      });
    } else {
      currentVideoId = "";
      stopPlaytimeTicker();
    }
  }, 1000);
}

startURLTracking();

resumeCheckInterval = setInterval(() => {
  const savedTime = sessionStorage.getItem("yt_resume_time");
  
  if (!savedTime) {
    clearInterval(resumeCheckInterval);
    return;
  }

  const isAdShowing = document.querySelector(".ad-showing, .ad-interrupting, .ytp-ad-player-overlay");
  
  if (isAdShowing) {
    return;
  }

  const videoElement = typeof getActiveVideoElement === "function" ? getActiveVideoElement() : document.querySelector("video");
  
  if (videoElement && videoElement.readyState >= 1) {
    clearInterval(resumeCheckInterval)

    videoElement.currentTime = parseFloat(savedTime);
    
    videoElement.play().catch(e => console.log("Auto-play blocked by browser"));
    
    sessionStorage.removeItem("yt_resume_time");
  }
}, 300);