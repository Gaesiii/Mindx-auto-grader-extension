// background.js

// Lắng nghe các phím tắt được khai báo trong manifest.json
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-extension') {
    
    // 1. Đọc trạng thái hiện tại
    chrome.storage.local.get(['isExtensionEnabled'], (result) => {
      const currentState = result.isExtensionEnabled !== false;
      const newState = !currentState; // Đảo ngược trạng thái (Bật -> Tắt, Tắt -> Bật)

      // 2. Lưu trạng thái mới vào bộ nhớ
      chrome.storage.local.set({ isExtensionEnabled: newState }, () => {
        
        // 3. Gửi tin nhắn đến Tab đang mở hiện tại để yêu cầu hiện thông báo 2 giây
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "SHOW_TOAST",
              state: newState
            }).catch(() => {
              // Bỏ qua lỗi nếu tab hiện tại là tab hệ thống không cho phép chạy code
            });
          }
        });
        
      });
    });
  }
});