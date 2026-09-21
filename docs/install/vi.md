# Cài đặt MMJ

> ⚠️ **Trang này được dịch bằng máy và chưa có người bản ngữ rà soát.**
> [`en.md`](en.md) (tiếng Anh) là bản chuẩn; nếu có khác biệt, bản tiếng Anh là đúng.
> Rất hoan nghênh các bản sửa.
>
> **Machine-translated. No native speaker has reviewed this page.**
> [`en.md`](en.md) is authoritative. Corrections welcome.

> **Các component đã có trên npm.** Mọi thứ còn lại bạn tự host.
>
> ```bash
> pnpm add @mmj-map/elements
> ```
>
> **Lệnh đó chỉ cho bạn các component, không có gì khác.** Không có endpoint tile hay style
> được lưu trữ sẵn: bạn vẫn phải tự cung cấp tệp `.pmtiles` và tệp style JSON.
> **Đó chính là chủ đích** — không khoá API, không tính tiền theo lượt xem, không máy chủ tile.

Một bản đồ cần ba thứ. MMJ cung cấp hai thứ sau, và chỉ cho bạn cách tạo thứ đầu tiên.

| | Là gì | Lấy từ đâu |
| --- | --- | --- |
| 1 | **Tiles** — một tệp `.pmtiles` | Bạn tự cắt, hoặc tải tệp demo |
| 2 | **Style** — một tệp `.json` | Thư mục `styles/` trong kho này (6 bản) |
| 3 | **Components** — ESM thuần, không cần build | `packages/elements/src/` |

**Không cần chạy máy chủ nào.** Hosting tĩnh cộng với HTTP Range là toàn bộ câu chuyện.

## 1. Lấy tiles

### A. Tải tiles demo (nhanh nhất)

```bash
gh release download demo-tiles-20260915 \
  --repo meta-taro/modern-map-japan \
  --pattern demo.pmtiles --output tiles/demo.pmtiles
```

**62,8 MB, chỉ có Osaka, zoom 0–15.** Đủ để xem bạn có thích bản đồ này không,
**nhưng không đủ để triển khai một trang web về nơi khác.**

### B. Tự cắt lấy

Cắt bất kỳ khu vực nào trên Trái Đất từ bản dựng hằng ngày của
[Protomaps](https://protomaps.com/). Bạn cần [go-pmtiles](https://github.com/protomaps/go-pmtiles)
và dung lượng đĩa.

```bash
git clone https://github.com/meta-taro/modern-map-japan
cd modern-map-japan && pnpm install
pnpm tiles:extract -- demo        # hoặc japan / kansai, hoặc thêm vùng của riêng bạn
```

Hướng dẫn đầy đủ ở [`docs/tiles/README.md`](../tiles/README.md) (tiếng Nhật).
**Chỉ dùng dữ liệu công khai và công cụ công khai** — không tài khoản, không khoá, không hạn mức.

> **Kích thước rất quan trọng.** Một tệp lớn hơn 100 MB sẽ không đặt được lên GitHub Pages.
> **Hãy cắt khu vực nhỏ hơn hoặc ít mức zoom hơn**, trước khi nghĩ đến việc trả tiền cho
> một máy chủ tile.

## 2. Chọn một style

Sao chép một tệp `.json` từ [`styles/`](../../styles/) đặt cạnh trang của bạn.

| Tệp | Trông thế nào |
| --- | --- |
| `modern-dark.json` | Ban đêm. Mặc định |
| `modern-light.json` | Ban ngày. Đường để trắng, phân cấp chỉ bằng độ rộng |
| `modern-ink.json` | Đơn sắc. In đen trắng vẫn đọc được |
| `modern-sand.json` | Tông ấm. Gần với bản đồ giấy |
| `modern-neon.json` | Neon ban đêm. Phân cấp đường bằng **sắc màu**, không bằng độ sáng |
| `modern-candy.json` | Pastel ban ngày. Cùng dải sắc màu, ở phía sáng |

**Cả 6 bản đều là đề xuất, không phải bảng màu đã được duyệt**
(xem [`styles/README.md`](../../styles/README.md)).

Mọi style đều giữ `__TILES_URL__` làm chỗ giữ chỗ. **Đừng ghi cứng URL tile vào đó** —
component sẽ thay thế khi tải, nhờ vậy cùng một style chạy được ở mọi môi trường.

## 3. Lấy components

```bash
pnpm add @mmj-map/elements
```

Hoặc sao chép thủ công. Chúng là ES module thuần và **không có bước build**, nên cách nào cũng được:

```bash
cp -r packages/elements/src/ your-site/elements/
```

Ví dụ bên dưới dùng đường dẫn đã sao chép (`./elements/index.js`). Nếu cài từ npm,
hãy trỏ tới `node_modules/@mmj-map/elements/src/index.js`, hoặc để bundler phân giải
`@mmj-map/elements`.

## 4. Trang web

```html
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<style>
  mmj-map { display: block; height: 70vh; }
</style>
</head>
<body>

<mmj-map
  tiles="./tiles/demo.pmtiles"
  style-url="./styles/modern-dark.json"
  center="135.5023,34.6937"
  zoom="12">
  <mmj-marker lnglat="135.4959,34.7024" popup="Umeda"></mmj-marker>
</mmj-map>

<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>
</body>
</html>
```

`maplibre-gl` và `pmtiles` do **bạn** nạp bằng thẻ `<script>`. MMJ không đóng gói chúng,
nên **bạn giữ quyền kiểm soát phiên bản**.

`center` là `kinh độ,vĩ độ` — cùng thứ tự với GeoJSON, ngược với cách nói thường ngày.

## Màu thương hiệu của bạn

Hầu hết các trang đều có một màu. Bạn không nên phải viết một tệp style 180 dòng chỉ để dùng nó.

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" accent="#0A5FFF"></mmj-map>
```

`accent` được áp lên đường cao tốc và viền vòng tròn nhà ga, đồng thời trở thành màu mặc định
cho marker, cluster và POI của riêng bạn.
**Nó không sơn lại toàn bộ bản đồ** — nếu làm vậy, đất, nước, công trình và đường sẽ không còn
phân biệt được nữa.

Nếu muốn kiểm soát hoàn toàn, hãy chỉ định cả 24 vai trò:

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" palette-url="./brand.json"></mmj-map>
```

Tệp đó có thể được tạo ra từ 4 màu, không cần viết tay:

```bash
pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff --out=brand.json
```

Xem [`tools/palette/README.md`](../../tools/palette/README.md), trong đó cũng mô tả một
**máy chủ MCP** để agent có thể tạo bảng màu giúp bạn.

## Ghi công là bắt buộc

Dữ liệu nền đến từ OpenStreetMap, theo giấy phép **ODbL 1.0**.
Dòng `© OpenStreetMap contributors` phải luôn hiển thị trên màn hình.
Component luôn vẽ nó và **không cung cấp thuộc tính nào để tắt đi**.

Mã nguồn và các style theo giấy phép MIT. Dữ liệu của riêng bạn đặt chồng lên vẫn là của bạn.
Hãy đọc [`LICENSES.md`](../../LICENSES.md) trước khi phát hành.

## Những thứ chưa sẵn sàng

- **Tiles được lưu trữ sẵn.** Không có endpoint tile nào của MMJ để trỏ tới. Bạn tự host tệp của mình
- **Định tuyến.** `<mmj-route>` chỉ **vẽ** tuyến đường bạn cung cấp; nó không tính toán tuyến
- **Tệp glyph cho chữ CJK.** Nhãn tiếng Nhật/Trung dùng phông của chính người xem
  (`localIdeographFontFamily`), nên hình chữ thay đổi theo thiết bị

## Thêm

- [`docs/elements/README.md`](../elements/README.md) — mọi thuộc tính của mọi component
- [`docs/styles/README.md`](../styles/README.md) — cách kiểm tra style đối chiếu với tiles
- [`docs/serving/README.md`](../serving/README.md) — hosting và HTTP Range
- Demo trực tiếp: https://meta-taro.github.io/modern-map-japan/
