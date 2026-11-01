# OCR KTP — Google Cloud Vision

A framework-agnostic, fully typed TypeScript package for extracting Indonesian KTP data using Google Cloud Vision OCR.

Inspired by [Bukalapak/KTPextractor](https://github.com/bukalapak/KTPextractor), a Python-based project that extracts structured data from Indonesian KTP images.

This package provides a modern TypeScript implementation with a simple API that can be used across different Node.js frameworks and applications.

## Features

- TypeScript-first and fully typed
- Framework agnostic
- Google Cloud Vision OCR
- Indonesian KTP data extraction
- Simple API
- Works with any Node.js framework or runtime that supports the package
- No dependency on Express, NestJS, Fastify, or other web frameworks

## Installation

```bash
npm install https://github.com/fhmonly/OCR_KTP_google_cloud_vision
```

Using pnpm:

```bash
pnpm add https://github.com/fhmonly/OCR_KTP_google_cloud_vision
```

Using yarn:

```bash
yarn add https://github.com/fhmonly/OCR_KTP_google_cloud_vision
```

## Google Cloud Vision Setup

This package uses Google Cloud Vision for OCR.

Before using the package, you need to:

1. Create a Google Cloud Project.
2. Enable the **Cloud Vision API**.
3. Create a Service Account.
4. Create/download the Service Account credentials.

Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to your credentials file.

### Linux / macOS

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

### Windows PowerShell

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
```

Do not commit your credentials to source control.

## Usage

The package is designed to work independently of any framework.

### Basic Example

```typescript
import { readFile } from "node:fs/promises";
import { extractKTP } from "<package-name>";

const image = await readFile("./ktp.jpg");

const result = await extractKTP(image);

console.log(result);
```

The same API can be used inside Express, Fastify, NestJS, CLI applications, workers, or other Node.js applications.

### Express

```typescript
const result = await extractKTP(req.file.buffer);
```

### NestJS

```typescript
const result = await extractKTP(file.buffer);
```

### Fastify

```typescript
const result = await extractKTP(fileBuffer);
```

The package does not require or depend on any of these frameworks.

## Result

Example:

```json
{
  "nik": "3509123456789012",
  "nama": "BUDI SANTOSO",
  "tempatTanggalLahir": "JEMBER, 10-10-2000",
  "jenisKelamin": "LAKI-LAKI",
  "golonganDarah": "O",
  "alamat": "JL. MAWAR NO. 10",
  "rtRw": "001/002",
  "kelurahan": "CONTOH",
  "kecamatan": "CONTOH",
  "agama": "ISLAM",
  "statusPerkawinan": "BELUM KAWIN",
  "pekerjaan": "PELAJAR/MAHASISWA",
  "kewarganegaraan": "WNI",
  "berlakuHingga": "SEUMUR HIDUP"
}
```

The exact result may vary depending on the quality and content of the KTP image.

## API

### `extractKTP()`

```typescript
extractKTP(image: Buffer): Promise<KTP>
```

#### Parameters

| Parameter | Type | Description |
|---|---|---|
| `image` | `Buffer` | KTP image data |

#### Returns

```typescript
Promise<KTP>
```

### `KTP`

```typescript
interface KTP {
  nik?: string;
  nama?: string;
  tempatTanggalLahir?: string;
  jenisKelamin?: string;
  golonganDarah?: string;
  alamat?: string;
  rtRw?: string;
  kelurahan?: string;
  kecamatan?: string;
  agama?: string;
  statusPerkawinan?: string;
  pekerjaan?: string;
  kewarganegaraan?: string;
  berlakuHingga?: string;
}
```

## How It Works

The extraction process can be summarized as:

```text
KTP Image
    │
    ▼
Google Cloud Vision
    │
    ▼
OCR Text
    │
    ▼
KTP Parser
    │
    ▼
Structured KTP Data
```

Google Cloud Vision is responsible for OCR, while this package handles the extraction of structured KTP fields from the OCR result.

## Framework Agnostic

This package intentionally does not depend on any application framework.

You can use it with:

```text
Node.js
Express
Fastify
NestJS
Hono
Next.js
Nuxt
CLI
Background Worker
```

The package only exposes a library API and does not provide HTTP routes, controllers, middleware, or framework-specific modules.

## Requirements

- Node.js
- Google Cloud Project
- Cloud Vision API
- Google Cloud credentials

## Limitations

OCR accuracy depends on the input image.

Results may be affected by:

- Image resolution
- Blur
- Lighting
- Reflection
- Rotation
- Perspective
- Image compression
- KTP condition
- OCR recognition errors

This package performs OCR and data extraction. It does **not** verify whether a KTP is authentic or whether the extracted identity belongs to the person submitting the document.

## Privacy & Security

KTP contains sensitive personal information.

When using this package in production:

- Do not commit Google Cloud credentials.
- Avoid logging complete KTP data.
- Avoid unnecessarily storing KTP images.
- Delete temporary images when they are no longer required.
- Protect extracted personal information appropriately.
- Apply suitable data retention and access-control policies.

## Inspiration

This project is inspired by:

**[Bukalapak/KTPextractor](https://github.com/bukalapak/KTPextractor)**

`KTPextractor` is a Python-based open-source project that extracts data from Indonesian KTP images. The original project separates OCR text extraction from KTP entity extraction.

This project provides a TypeScript implementation with a framework-agnostic API and Google Cloud Vision as the OCR provider.

## License

This project is licensed under the **MIT License**.

See the [LICENSE](LICENSE) file for the complete license text.

## Author

**Just Human**

GitHub: [@fhmonly](https://github.com/fhmonly)