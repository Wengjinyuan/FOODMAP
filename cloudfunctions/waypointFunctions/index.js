const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PRESET_CATEGORIES = ["美食", "咖啡", "风景", "根据地", "购物", "娱乐", "其他"];

// ── 附近传送点 ──
const getNearbyWaypoints = async (event) => {
  const { latitude, longitude, maxDistance = 5000, skip = 0, limit = 50 } = event;
  const result = await db.collection("waypoints")
    .where({
      location: _.geoNear({
        geometry: db.Geo.Point(latitude, longitude),
        minDistance: 0,
        maxDistance,
      }),
    })
    .skip(skip).limit(limit).get();
  return { success: true, data: result.data };
};

// ── 搜索传送点 ──
const searchWaypoints = async (event) => {
  const { keyword = "", category = "", skip = 0, limit = 50 } = event;
  const conditions = [];
  if (keyword) conditions.push({ name: db.RegExp({ regexp: keyword, options: "i" }) });
  if (category) conditions.push({ category });
  const query = conditions.length > 0 ? _.and(conditions) : {};
  const result = await db.collection("waypoints").where(query).skip(skip).limit(limit).get();
  return { success: true, data: result.data };
};

// ── 传送点详情 ──
const getWaypointDetail = async (event) => {
  const { waypointId } = event;
  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  return { success: true, data: doc.data };
};

// ── 新增传送点 ──
const addWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { name, category, latitude, longitude, address, images, notes, tags, rating } = event;
  if (!name || !category || latitude == null || longitude == null) {
    return { success: false, errMsg: "名称、分类和位置为必填项" };
  }
  const now = new Date();
  const res = await db.collection("waypoints").add({
    data: {
      name,
      category,
      location: db.Geo.Point(latitude, longitude),
      address: address || "",
      images: images || [],
      notes: notes || "",
      tags: tags || [],
      rating: Number(rating) || 0,
      _openid: wxContext.OPENID,
      create_time: now,
      update_time: now,
    },
  });
  return { success: true, data: { _id: res._id } };
};

// ── 更新传送点 ──
const updateWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { waypointId, name, category, latitude, longitude, address, images, notes, tags, rating } = event;

  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  if (doc.data._openid !== wxContext.OPENID) return { success: false, errMsg: "无权修改" };

  const updateData = { update_time: new Date() };
  if (name !== undefined) updateData.name = name;
  if (category !== undefined) updateData.category = category;
  if (latitude != null && longitude != null) updateData.location = db.Geo.Point(latitude, longitude);
  if (address !== undefined) updateData.address = address;
  if (images !== undefined) updateData.images = images;
  if (notes !== undefined) updateData.notes = notes;
  if (tags !== undefined) updateData.tags = tags;
  if (rating !== undefined) updateData.rating = Number(rating);

  await db.collection("waypoints").doc(waypointId).update({ data: updateData });
  return { success: true };
};

// ── 删除传送点 ──
const deleteWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { waypointId } = event;
  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  if (doc.data._openid !== wxContext.OPENID) return { success: false, errMsg: "无权删除" };
  await db.collection("waypoints").doc(waypointId).remove();
  return { success: true };
};

// ── 我的传送点 ──
const getMyWaypoints = async (event) => {
  const wxContext = cloud.getWXContext();
  const { category = "", orderBy = "create_time", skip = 0, limit = 50 } = event;
  const query = { _openid: wxContext.OPENID };
  if (category) query.category = category;
  const result = await db.collection("waypoints").where(query).orderBy(orderBy, "desc").skip(skip).limit(limit).get();
  return { success: true, data: result.data };
};

// ── 统计 ──
const getMyStats = async () => {
  const wxContext = cloud.getWXContext();
  const all = await db.collection("waypoints").where({ _openid: wxContext.OPENID }).get();
  const categoryCount = {};
  all.data.forEach((wp) => {
    categoryCount[wp.category] = (categoryCount[wp.category] || 0) + 1;
  });
  return { success: true, data: { total: all.data.length, categories: categoryCount } };
};

// ── 获取预定义分类 ──
const getPresetCategories = async () => {
  return { success: true, data: PRESET_CATEGORIES };
};

// ── 主入口 ──
exports.main = async (event, context) => {
  const { action } = event;
  switch (action) {
    case "getNearbyWaypoints": return await getNearbyWaypoints(event);
    case "searchWaypoints": return await searchWaypoints(event);
    case "getWaypointDetail": return await getWaypointDetail(event);
    case "addWaypoint": return await addWaypoint(event);
    case "updateWaypoint": return await updateWaypoint(event);
    case "deleteWaypoint": return await deleteWaypoint(event);
    case "getMyWaypoints": return await getMyWaypoints(event);
    case "getMyStats": return await getMyStats();
    case "getPresetCategories": return await getPresetCategories();
    default: return { success: false, errMsg: "未知操作: " + action };
  }
};
