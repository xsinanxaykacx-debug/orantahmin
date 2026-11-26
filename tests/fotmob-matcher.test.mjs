import test from "node:test";
import assert from "node:assert/strict";
import {
  createFotMobEventMap,
  fetchFotMobFixtures,
  getFotMobDates,
  matchBulletinToFotMob,
  toFotMobDate,
} from "../scripts/fotmob/matcher.ts";

const row = (overrides = {}) => ({
  matchId: "100",
  homeName: "Sabah U19",
  awayName: "Barcelona U19",
  date: "26.11.2026",
  time: "14:00",
  fields: { leagueCode: "UEGL", groupId: "333", subgroupId: "13902" },
  ...overrides,
});

const fixture = (overrides = {}) => ({
  id: 9001,
  date: "20261126",
  home: "Sabah FK U19",
  away: "Barcelona U19",
  league: "UEFA Youth League",
  ...overrides,
});

test("Mackolik date is validated and converted to FotMob YYYYMMDD", () => {
  assert.equal(toFotMobDate("26.11.2026"), "20261126");
  assert.equal(toFotMobDate("31.02.2026"), null);
  assert.equal(toFotMobDate("2026-11-26"), null);
});

test("only distinct valid bulletin dates are requested", () => {
  assert.deepEqual(
    getFotMobDates([
      row(),
      row({ matchId: "101" }),
      row({ date: "27.11.2026" }),
      row({ date: "bad-date" }),
    ]),
    ["20261126", "20261127"],
  );
});

test("same-day youth fixture is matched and carries source league identifiers", () => {
  const result = matchBulletinToFotMob([row()], [fixture()]);
  assert.equal(result[0].state, "matched");
  assert.equal(result[0].fotmobMatchId, 9001);
  assert.equal(result[0].confidence, 0.875);
  assert.equal(result[0].leagueCode, "UEGL");
  assert.equal(result[0].groupId, "333");
  assert.equal(result[0].leagueMatch, "unverified");
});

test("fixtures from adjacent dates are never considered", () => {
  const result = matchBulletinToFotMob(
    [row()],
    [fixture({ date: "20261125" }), fixture({ date: "20261127" })],
  );
  assert.equal(result[0].state, "unmatched");
  assert.equal(result[0].fotmobMatchId, null);
});

test("U19 cannot match a senior or U21 fixture", () => {
  const result = matchBulletinToFotMob(
    [row()],
    [
      fixture({ id: 1, home: "Sabah", away: "Barcelona", league: "Premier League" }),
      fixture({ id: 2, home: "Sabah U21", away: "Barcelona U21", league: "U21 League" }),
    ],
  );
  assert.equal(result[0].state, "unmatched");
});

test("women's competitions cannot be matched to an unmarked men's fixture", () => {
  const result = matchBulletinToFotMob(
    [row({ homeName: "Team", awayName: "Club", fields: { leagueCode: "ABC" } })],
    [fixture({ home: "Team Women", away: "Club Women", league: "Women's League" })],
  );
  assert.equal(result[0].state, "unmatched");
});

test("near-identical top candidates are marked ambiguous without an ID", () => {
  const result = matchBulletinToFotMob(
    [row()],
    [fixture({ id: 1 }), fixture({ id: 2 })],
  );
  assert.equal(result[0].state, "ambiguous");
  assert.equal(result[0].fotmobMatchId, null);
  assert.equal(result[0].candidates.length, 2);
});

test("one FotMob event cannot be assigned to two Mackolik rows", () => {
  const result = matchBulletinToFotMob(
    [row({ matchId: "100" }), row({ matchId: "101" })],
    [fixture()],
  );
  assert.deepEqual(result.map((item) => item.state), ["ambiguous", "ambiguous"]);
  assert.deepEqual(result.map((item) => item.fotmobMatchId), [null, null]);
});

test("missing teams and invalid dates receive explicit states", () => {
  const result = matchBulletinToFotMob(
    [
      row({ homeName: null }),
      row({ matchId: "102", date: "bad-date" }),
    ],
    [fixture()],
  );
  assert.deepEqual(
    result.map((item) => item.state),
    ["invalid_bulletin_team", "invalid_bulletin_date"],
  );
});

test("event map summary counts all states and only matched rows get IDs", () => {
  const map = createFotMobEventMap(
    [row(), row({ matchId: "101", date: "bad-date" })],
    [fixture()],
  );
  assert.equal(map.summary.matched, 1);
  assert.equal(map.summary.invalidBulletinDate, 1);
  assert.equal(map.matches[0].fotmobMatchId, 9001);
  assert.equal(map.matches[1].fotmobMatchId, null);
});

test("FotMob fetch rejects malformed responses instead of writing false unmatched results", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ unexpected: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(
    fetchFotMobFixtures(["20261126"], fakeFetch),
    /no leagues array/,
  );
});

test("two high-confidence matches establish a league guard for their Mackolik group", () => {
  const groupRow = (matchId, homeName, awayName) =>
    row({
      matchId,
      homeName,
      awayName,
      fields: { leagueCode: "ABC", groupId: "10", subgroupId: "20" },
    });
  const rows = [
    groupRow("201", "Alpha FC", "Beta FC"),
    groupRow("202", "Gamma FC", "Delta FC"),
    groupRow("203", "Echo FC", "Foxtrot FC"),
  ];
  const fixtures = [
    fixture({ id: 11, home: "Alpha FC", away: "Beta FC", league: "Trusted League - Group A" }),
    fixture({ id: 12, home: "Gamma FC", away: "Delta FC", league: "Trusted League - Group B" }),
    fixture({ id: 13, home: "Echo", away: "Foxtrot", league: "Wrong League" }),
  ];

  const result = matchBulletinToFotMob(rows, fixtures);
  assert.equal(result[0].state, "matched");
  assert.equal(result[1].state, "matched");
  assert.equal(result[2].state, "unmatched");
  assert.equal(result[2].leagueMatch, "group_consensus");
  assert.equal(result[2].fotmobMatchId, null);
});
