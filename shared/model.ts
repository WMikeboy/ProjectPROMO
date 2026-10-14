import { z } from "zod";
import twitterText from "twitter-text";
export const sheetSchema = z.object({
  title: z.string().max(300),
  body: z.string().max(20000),
  tags: z.array(z.string().max(100)).max(30),
  platforms: z.array(z.enum(["x", "facebook", "threads", "instagram"])).max(4),
  assetIds: z.array(z.string().uuid()).max(4),
  scheduledAt: z.string().nullable(),
  location: z.string().max(200).default(""),
});
export type Content = z.infer<typeof sheetSchema>;
export type Sheet = {
  id: string;
  revision: number;
  content: Content;
  created_at: string;
  updated_at: string;
};
export function postText(c: Content) {
  return [
    c.title,
    c.body,
    c.tags.map((t) => (t.startsWith("#") ? t : "#" + t)).join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function validatePublish(
  c: Content,
  assets: { id: string; mime: string; size: number }[],
) {
  const errors: string[] = [];
  if (c.platforms.includes("threads") && Array.from(postText(c)).length > 500) errors.push("Threads 內容超過 500 字，請縮短標題、內文及 Tags");
  if (c.platforms.includes("instagram")) {
    if (!assets.length) errors.push("Instagram 需要圖片或影片，不能只發文字");
    if (Array.from(postText(c)).length > 2200) errors.push("Instagram 說明超過 2200 字");
    if (assets.some(a => !["image/jpeg", "video/mp4"].includes(a.mime))) errors.push("Instagram 首版支援 JPG 圖片或 MP4 Reels，請轉換其他格式");
  }
  if (c.platforms.includes("threads") && assets.some(a => !["image/jpeg", "image/png", "video/mp4"].includes(a.mime))) errors.push("Threads 首版支援 JPG、PNG 或 MP4");
  if (!postText(c).trim() && !assets.length) errors.push("請加入內容或素材");
  if (!c.platforms.length) errors.push("請選擇平台");
  if (new Set(c.platforms).size !== c.platforms.length)
    errors.push("平台不可重複");
  if (c.assetIds.length !== assets.length) errors.push("素材不存在");
  if (c.location) errors.push("第一版尚未支援地理位置發佈，請清空位置");
  if (c.scheduledAt && !Number.isFinite(Date.parse(c.scheduledAt)))
    errors.push("排程時間無效");
  if (c.platforms.includes("x") && postText(c).trim()) {
    const parsed = twitterText.parseTweet(postText(c));
    if (parsed.weightedLength > 280)
      errors.push(`X 文字 ${parsed.weightedLength}／280 加權字，超出 ${parsed.weightedLength - 280} 字（包含標題、內文、Tags 與換行）`);
    else if (!parsed.valid)
      errors.push("X 內容含無效字元，請檢查並移除特殊控制字元");
  }
  const videos = assets.filter((a) => a.mime.startsWith("video/"));
  const gifs = assets.filter((a) => a.mime === "image/gif");
  if ((videos.length || gifs.length) && assets.length > 1)
    errors.push("影片／GIF 請單獨放一張 Sheet");
  if (
    c.platforms.includes("x") &&
    assets.some(
      (a) =>
        a.mime.startsWith("image/") &&
        a.size > (a.mime === "image/gif" ? 15 : 5) * 1024 * 1024,
    )
  )
    errors.push("X 圖片超過 5 MB 或 GIF 超過 15 MB");
  if (c.platforms.includes("facebook") && gifs.length)
    errors.push("Facebook 首版請使用 JPG、PNG 或 MP4");
  return errors;
}
