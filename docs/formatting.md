# Tự format trước commit

Sau khi pull, chạy `npm install` ở root để cài dependency và kích hoạt Husky.
Trong VS Code, cài extension Prettier theo workspace recommendation.
TypeScript, JavaScript và JSON tự format khi lưu theo cấu hình gần file nhất.

Hook pre-commit chạy `npm run format:staged`: chỉ format file ts/cjs đang stage,
tự đưa kết quả vào commit, không format toàn repo. lint-staged giữ riêng phần
chưa stage khi một file vừa có thay đổi staged vừa có thay đổi unstaged.
Không cần tự git add lại trong cấu hình lint-staged.

CI vẫn chạy `npm run format:check`, không tự sửa hoặc push code.
Hook bị bỏ qua trong CI, production, hoặc khi đặt HUSKY=0; người bỏ qua hook
vẫn phải bảo đảm CI pass. Lỗi hook phải được sửa trước khi commit.

Có thể chạy `npm run prepare` để kích hoạt lại hook sau khi clone/cài đặt.
Git worktree được hỗ trợ. Không commit thư mục .husky/_ được Husky sinh tự động.
