import type { StoredUser } from "./types.js";

const DEFAULT_PASSWORD = "Transit!Demo2026";

export const DEVELOPMENT_BOOTSTRAP_PASSWORD = DEFAULT_PASSWORD;

export function createBootstrapUsers(): StoredUser[] {
  const now = new Date().toISOString();

  return [
    {
      id: "user-super-admin",
      email: "admin@demo-city.local",
      displayName: "Platform Super Admin",
      role: "super_admin",
      passwordChangedAt: now,
      passwordHash:
        "pbkdf2_sha512$210000$yuMlyJuMk7RI5VZ7feVwrg==$LKxvw27EjtZTWXW6oZxtrK2+EENKjFIqyUXrIROYt6UlCB3nxfEcqJDQlWrg411vQkylpBAD0niRn4SHJeQiaQ=="
    },
    {
      id: "user-dispatcher",
      email: "dispatcher@demo-city.local",
      displayName: "Dispatch Desk",
      role: "dispatcher",
      passwordChangedAt: now,
      passwordHash:
        "pbkdf2_sha512$210000$CHf+zHOTd8dzTA90nHDyAA==$VYZhpDXJuawe0sMdZoY2vtABIzWUjyOIKlnPtkLks/genyvfGmwcoCAkx9eKt4p+C8Fxp1yJTeY1WWuEx+tLwA=="
    },
    {
      id: "user-operator",
      email: "operator@demo-city.local",
      displayName: "Operations Console",
      role: "operator",
      passwordChangedAt: now,
      passwordHash:
        "pbkdf2_sha512$210000$QrSeffdYETDDpTKKKc+PXQ==$GGSm+Vjng5mbGDrdzW1KOznaYXJv0KT1k2KUXA3avY8rkrzDipY4USgPEw1ff9SZWIVUes0FNnLKFJ7UtMbGbg=="
    },
    {
      id: "user-viewer",
      email: "viewer@demo-city.local",
      displayName: "Read-Only Viewer",
      role: "viewer",
      passwordChangedAt: now,
      passwordHash:
        "pbkdf2_sha512$210000$GDvGgrXwyYqqP8X9ZHWafA==$FmBxBORLAuEDXQbK1WwdNqbmPjZ+pPyMmdNk2GWUz3QCiAeswurEFk9GMTvw6NC8uG097Zk4cuvDQVoMBMnU1w=="
    }
  ];
}