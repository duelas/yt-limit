function updatePopupUI(success) {
  if (!chrome.runtime || !chrome.runtime.id) return;

  chrome.runtime.sendMessage({ action: "checkTimeAllowance" }, (response) => {
    if (!response) return;

    // 1. Calculate and update Remaining Countdown Clock
    const remainingSeconds = response.remaining;
    const countMins = Math.floor(remainingSeconds / 60);
    const countSecs = remainingSeconds % 60;

    const countEl = document.getElementById('count');
    countEl.textContent = `${countMins}:${countSecs.toString().padStart(2, '0')}`;

    switch (success) {
      case 1:
        countEl.style.color = "#2ecc71";
        break;
      case 2:
        countEl.style.color = "#c94f4f";
        break;
      case 0:
        countEl.style.color = "#ffffff";
      default:
        break;
    }

    // 2. Render dynamic allowances calculated from background configs
    const maxAllowedMinutes = Math.floor(response.maxAllowed / 60);
    document.getElementById('limit-label').textContent = `Total Budget: ${maxAllowedMinutes} Mins`;

    // 3. Render Postponed Reset Deadline Timestamp String
    const resetTimeFormatted = new Date(response.nextResetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('reset-label').innerHTML = `🔄 Resets at <strong>${resetTimeFormatted}</strong>`;

    const configMinutes = response.baseAllowance >= 60 ? Math.floor(response.baseAllowance / 60) : response.baseAllowance;
    const configUnitLabel = response.baseAllowance >= 60 ? "Mins" : "Secs";
    
    const configHours = response.hourInMs / (60 * 60 * 1000);
    
    const btnEl = document.getElementById('add-time-btn');
    if (btnEl) {
      btnEl.textContent = `+${configMinutes} ${configUnitLabel} (+${configHours}hr Reset Delay)`;
    }


    // 4. Update the structural Status Text Layout Indicators
    const statusEl = document.getElementById('status');
    if (remainingSeconds <= 0) {
      statusEl.textContent = "Status: Time Expired! 🛑";
      statusEl.className = "status-blocked";
    } else {
      statusEl.textContent = "Status: Streaming Allowed ✅";
      statusEl.className = "status-ok";
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updatePopupUI();
  const uiTicker = setInterval(() => updatePopupUI(3), 1000);

  // Bind click listener event handler callback to the Add Time Button 
  document.getElementById('add-time-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "manuallyAddUnits" }, (response) => {
      if (response) {
        updatePopupUI(response.success); // Instantly update view without waiting for the next ticker tick
	setTimeout(() => updatePopupUI(0), 500)
      }
    });
  });

  window.addEventListener('unload', () => clearInterval(uiTicker));
});