import { describe, it, expect } from "vitest";

import { Role } from "@/lib/generated/prisma/enums";
import { filterUsers } from "@/components/users/filter-users";
import type { UserListItem } from "@/models/user.model";

const admin: UserListItem = {
  id: "1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: Role.ADMIN,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const agent: UserListItem = {
  id: "2",
  name: "Grace Hopper",
  email: "grace@example.com",
  role: Role.AGENT,
  createdAt: "2026-01-02T00:00:00.000Z",
};

// A user with no display name — the adapter allows User.name to be null, so
// the search matcher must fall back to "" instead of crashing on it.
const nameless: UserListItem = {
  id: "3",
  name: null,
  email: "noname@example.com",
  role: Role.AGENT,
  createdAt: "2026-01-03T00:00:00.000Z",
};

const users = [admin, agent, nameless];

describe("filterUsers", () => {
  it("returns every user when search is empty and role is ALL", () => {
    expect(filterUsers(users, "", "ALL")).toEqual(users);
  });

  it("filters by role only", () => {
    expect(filterUsers(users, "", Role.ADMIN)).toEqual([admin]);
    expect(filterUsers(users, "", Role.AGENT)).toEqual([agent, nameless]);
  });

  it("matches search against name, case-insensitively", () => {
    expect(filterUsers(users, "lovelace", "ALL")).toEqual([admin]);
    expect(filterUsers(users, "ADA", "ALL")).toEqual([admin]);
  });

  it("matches search against email, case-insensitively", () => {
    expect(filterUsers(users, "grace@example", "ALL")).toEqual([agent]);
  });

  it("trims surrounding whitespace from the search query", () => {
    expect(filterUsers(users, "  ada  ", "ALL")).toEqual([admin]);
  });

  it("does not throw on a null name and just doesn't match it by name", () => {
    expect(filterUsers(users, "noname", "ALL")).toEqual([nameless]);
    // A search that would only ever match a *name* finds nothing for the
    // nameless user, rather than throwing on `null.toLowerCase()`.
    expect(filterUsers([nameless], "anything", "ALL")).toEqual([]);
  });

  it("combines search and role with AND, not OR", () => {
    // Matches the search term but not the role.
    expect(filterUsers(users, "ada", Role.AGENT)).toEqual([]);
    // Matches the role but not the search term.
    expect(filterUsers(users, "nobody-matches-this", Role.AGENT)).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterUsers(users, "nobody-matches-this", "ALL")).toEqual([]);
  });
});
