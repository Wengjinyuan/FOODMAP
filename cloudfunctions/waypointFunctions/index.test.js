const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return {
      DYNAMIC_CURRENT_ENV: "test-env",
      init() {},
      database() {
        return {
          command: {},
          Geo: { Point(longitude, latitude) { return { longitude, latitude }; } },
        };
      },
      getWXContext() {
        return { OPENID: "owner-openid" };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const waypointFunctions = require("./index");

Module._load = originalLoad;

const { normalizeVisibility, decorateWaypointForUser } = waypointFunctions._test;

assert.equal(normalizeVisibility("public"), "public");
assert.equal(normalizeVisibility("private"), "private");
assert.equal(normalizeVisibility("anything-else"), "private");
assert.equal(normalizeVisibility(undefined), "private");

const ownerView = decorateWaypointForUser(
  { _id: "wp1", _openid: "owner-openid", visibility: "private" },
  "owner-openid"
);
assert.equal(ownerView.isOwner, true);
assert.equal(ownerView.canManage, true);
assert.equal(ownerView._openid, "owner-openid");

const publicViewerView = decorateWaypointForUser(
  { _id: "wp1", _openid: "owner-openid", visibility: "public" },
  "viewer-openid"
);
assert.equal(publicViewerView.isOwner, false);
assert.equal(publicViewerView.canManage, false);
assert.equal(publicViewerView._openid, undefined);

const adminView = decorateWaypointForUser(
  { _id: "wp1", _openid: "owner-openid", visibility: "private" },
  "oAX1I3Q98EjJh5d8lZ0r61of245k"
);
assert.equal(adminView.isAdmin, true);
assert.equal(adminView.canManage, true);
assert.equal(adminView._openid, "owner-openid");
