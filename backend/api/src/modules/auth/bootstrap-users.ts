import type { StoredUser } from "./types.js";

const DEFAULT_PASSWORD = "Transit!Demo2026";

export const DEVELOPMENT_BOOTSTRAP_PASSWORD = DEFAULT_PASSWORD;

export function createBootstrapUsers(): StoredUser[] {
  const now = new Date().toISOString();

  return [
    {
      createdAt: now,
      displayName: "Platform Super Admin",
      email: "admin@demo-city.local",
      id: "user-super-admin",
      mustChangePassword: false,
      passwordChangedAt: now,
      passwordHash:
        "pbkdf2_sha512$210000$yuMlyJuMk7RI5VZ7feVwrg==$LKxvw27EjtZTWXW6oZxtrK2+EENKjFIqyUXrIROYt6UlCB3nxfEcqJDQlWrg411vQkylpBAD0niRn4SHJeQiaQ==",
      role: "super_admin",
      status: "active",
      updatedAt: now
    },
    {
      createdAt: now,
      displayName: "Dispatch Desk",
      email: "dispatcher@demo-city.local",
      id: "user-dispatcher",
      mustChangePassword: false,
      passwordChangedAt: now,
      passwordHash:
        "pbkdf2_sha512$210000$CHf+zHOTd8dzTA90nHDyAA==$VYZhpDXJuawe0sMdZoY2vtABIzWUjyOIKlnPtkLks/genyvfGmwcoCAkx9eKt4p+C8Fxp1yJTeY1WWuEx+tLwA==",
      role: "dispatcher",
      status: "active",
      updatedAt: now
    },
    {
      createdAt: now,
      displayName: "Operations Console",
      email: "operator@demo-city.local",
      id: "user-operator",
      mustChangePassword: false,
      passwordChangedAt: now,
      passwordHash:
        "pbkdf2_sha512$210000$QrSeffdYETDDpTKKKc+PXQ==$GGSm+Vjng5mbGDrdzW1KOznaYXJv0KT1k2KUXA3avY8rkrzDipY4USgPEw1ff9SZWIVUes0FNnLKFJ7UtMbGbg==",
      role: "operator",
      status: "active",
      updatedAt: now
    },
    {
      createdAt: now,
      displayName: "Read-Only Viewer",
      email: "viewer@demo-city.local",
      id: "user-viewer",
      mustChangePassword: false,
      passwordChangedAt: now,
      passwordHash:
        "pbkdf2_sha512$210000$GDvGgrXwyYqqP8X9ZHWafA==$FmBxBORLAuEDXQbK1WwdNqbmPjZ+pPyMmdNk2GWUz3QCiAeswurEFk9GMTvw6NC8uG097Zk4cuvDQVoMBMnU1w==",
      role: "viewer",
      status: "active",
      updatedAt: now
    }
  ];
}
