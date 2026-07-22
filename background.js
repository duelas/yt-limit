const CONFIG = {
  BASE_ALLOWANCE: 10 * 60,	// in seconds
  HOUR_IN_MS: 60 * 60 * 1000,	// in miliseconds
  MAX_TOPUP: 30 * 60,		// in seconds
  COMMENT_COST: 5 * 60,		// in seconds
  COMMENT_ALLOWANCE: 5 * 60	// in seconds

};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ 
    consumedSeconds: 0, 
    maxAllowedSeconds: CONFIG.BASE_ALLOWANCE,
    lastReset: Date.now() 
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === "checkTimeAllowance") {
    chrome.storage.local.get(['consumedSeconds', 'maxAllowedSeconds', 'lastReset'], (data) => {
      let consumed = data.consumedSeconds || 0;
      let maxAllowed = data.maxAllowedSeconds || CONFIG.BASE_ALLOWANCE;
      let lastReset = data.lastReset || Date.now();

      // If the current expiration deadline has passed, reset everything to baseline defaults
      const currentResetDeadline = lastReset + CONFIG.HOUR_IN_MS;
      if (Date.now() > currentResetDeadline) {
        consumed = 0;
        maxAllowed = CONFIG.BASE_ALLOWANCE;
        lastReset = Date.now();
        chrome.storage.local.set({ consumedSeconds: consumed, maxAllowedSeconds: maxAllowed, lastReset: lastReset });
      }

      sendResponse({ 
        consumed: consumed,
	maxAllowed: maxAllowed,
        remaining: Math.max(0, maxAllowed - consumed),
        nextResetAt: lastReset + CONFIG.HOUR_IN_MS,
        baseAllowance: CONFIG.BASE_ALLOWANCE, 
        hourInMs: CONFIG.HOUR_IN_MS
      });
    });
    return true;
  }

  if (request.action === "addPlaytime") {
    chrome.storage.local.get(['consumedSeconds'], (data) => {
      let consumed = data.consumedSeconds || 0;
      consumed += request.seconds;
      chrome.storage.local.set({ consumedSeconds: consumed });
    });
    return true;
  }

  if (request.action === "manuallyAddUnits") {
    chrome.storage.local.get(['maxAllowedSeconds', 'lastReset'], (data) => {
      let maxAllowed = data.maxAllowedSeconds || CONFIG.BASE_ALLOWANCE;
      let lastReset = data.lastReset || Date.now();
            let  isSuccess = 1;

            // if trying to add time surpassing max topup limit
            if ( maxAllowed >= CONFIG.MAX_TOPUP ) {
	isSuccess = 2;
            } else {
      maxAllowed += CONFIG.BASE_ALLOWANCE;
      lastReset += CONFIG.HOUR_IN_MS;
            }

      chrome.storage.local.set({ maxAllowedSeconds: maxAllowed, lastReset: lastReset }, () => {
        sendResponse({ success: isSuccess });
      });
    });
    return true;
  }

  if (request.action === "purchaseComments") {

    chrome.storage.local.get(['consumedSeconds', 'maxAllowedSeconds'], (data) => {
      let consumed = data.consumedSeconds || 0;
      let maxAllowed = data.maxAllowedSeconds || CONFIG.BASE_ALLOWANCE;
      let remaining = Math.max(0, maxAllowed - consumed);

      if (remaining >= CONFIG.COMMENT_COST) {
        consumed += CONFIG.COMMENT_COST; 
        chrome.storage.local.set({ consumedSeconds: consumed }, () => {
          sendResponse({ success: true, remaining: maxAllowed - consumed, commentAllowed: CONFIG.COMMENT_ALLOWANCE });
        });
      } else {
        sendResponse({ success: false});
      }
    });
    return true; 
  }

  if (request.action === "resetQuotaToZero") {
    chrome.storage.local.get(['maxAllowedSeconds'], (data) => {
      let maxAllowed = data.maxAllowedSeconds || CONFIG.BASE_ALLOWANCE;
      
      let lockdownConsumedSeconds = maxAllowed - 3;

      chrome.storage.local.set({ 
        consumedSeconds: lockdownConsumedSeconds
      }, () => {
        sendResponse({ success: true });
      });
    });
    return true; 
  }


});