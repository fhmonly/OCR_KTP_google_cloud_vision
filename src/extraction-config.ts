import type { LabelDefinition } from "./association/association-types.js";

export const KTP_LABELS: LabelDefinition[] = [
  {
    field: "province",
    aliases: ["Provinsi"],
  },
  {
    field: "city",
    aliases: ["Kota", "Kabupaten"],
  },
  {
    field: "identity_number",
    aliases: ["NIK"],
  },
  {
    field: "fullname",
    aliases: ["Nama"],
  },
  {
    field: "birth_place",
    aliases: ["Tempat/Tgl Lahir", "Tempat Tgl Lahir", "Tempat Lahir"],
  },
  {
    field: "gender",
    aliases: ["Jenis Kelamin", "Kelamin"],
  },
  {
    field: "blood_type",
    aliases: ["Gol Darah", "Gol. Darah", "Darah"],
  },
  {
    field: "address",
    aliases: ["Alamat"],
  },
  {
    field: "rt_rw",
    aliases: ["RT/RW", "RT RW"],
  },
  {
    field: "kel_desa",
    aliases: ["Kel/Desa", "Kel Desa"],
  },
  {
    field: "kecamatan",
    aliases: ["Kecamatan"],
  },
  {
    field: "religion",
    aliases: ["Agama"],
  },
  {
    field: "marital_status",
    aliases: ["Status Perkawinan"],
  },
  {
    field: "occupation",
    aliases: ["Pekerjaan"],
  },
  {
    field: "nationality",
    aliases: ["Kewarganegaraan"],
  },
  {
    field: "expired_date",
    aliases: ["Berlaku Hingga"],
  },
];
