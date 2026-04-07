const geminiApiKeyInput = document.getElementById('geminiApiKey');
const aiPromptInput = document.getElementById('aiPrompt');
const saveBtn = document.getElementById('saveBtn');

const DEFAULT_PROMPT = `Bạn là thầy giáo dạy lập trình thân thiện. Dựa vào từ khóa: "{keywords}". Viết thành 3 ý: (Lưu ý sử dụng ngôn từ phù hợp để phụ huynh đọc),Điểm mạnh của học viên: Khả năng, ưu điểm, tiến bộ rõ rệt mà học viên đã thể hiện (chủ động, nhanh nhẹn, tích cực, áp dụng tốt,..), Điểm cần cải thiện: Các vấn đề, điểm yếu, kỹ năng cần cải thiện, có thể là kỹ năng chuyên môn hoặc các yếu tố như sự sáng tạo, khả năng tư duy logic, khả năng giao tiếp.. (Cần cải thiện thêm về ...; Tăng cường về...; Chú ý hơn khi...), Lời khuyên: Gợi ý giải pháp cụ thể giúp học viên phát triển thêm kỹ năng hoặc cải thiện những vấn đề còn yếu (Khuyến khích làm thêm bài tập bổ sung; Tìm hiểu thêm về...; Rèn luyện thêm..).

Hãy viết 1 đoạn nhận xét chung dành cho phụ huynh, trình bày rõ ràng nhẹ nhàng, không dùng từ gây phản cảm hoặc chất vấn học viên. Dùng nói giảm nói tránh sao cho nhẹ nhưng vẫn truyền đạt được ý của keywords. và tối ưu nhất là khoảng 80 chữ.viết ngắn gọn , không cần kính gửi gì như viết thư. truyền đạt ý chính là đủ:

Ví dụ: 
Con là học sinh hòa đồng, luôn mang lại năng lượng tích cực cho lớp học. Bên cạnh đó, con cũng đã có sự tiến bộ nhất định khi bắt đầu cố gắng tự giải quyết một số bài tập. Tuy nhiên, con vẫn còn phụ thuộc vào công cụ hỗ trợ. Thầy mong con luyện tập nghiêm túc hơn, tự mình tư duy và làm bài để củng cố kiến thức và phát triển tư duy lập trình một cách bền vững..`;

chrome.storage.local.get(['geminiApiKey', 'aiPrompt'], (result) => {
  if (result.geminiApiKey) geminiApiKeyInput.value = result.geminiApiKey;
  aiPromptInput.value = result.aiPrompt || DEFAULT_PROMPT;
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    geminiApiKey: geminiApiKeyInput.value.trim(),
    aiPrompt: aiPromptInput.value.trim() || DEFAULT_PROMPT
  }, () => {
    alert("Đã lưu cấu hình thành công!");
  });
});