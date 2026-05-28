const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PRESET_CATEGORIES = ["美食", "咖啡", "风景", "根据地", "购物", "娱乐", "其他"];
const ADMIN_OPENID = 'oAX1I3Q98EjJh5d8lZ0r61of245k';

const normalizeVisibility = (visibility) => visibility === 'public' ? 'public' : 'private';
const isAdminOpenid = (openid) => openid === ADMIN_OPENID;
const canManageWaypoint = (waypoint, openid) => !!waypoint && (waypoint._openid === openid || isAdminOpenid(openid));

const decorateWaypointForUser = (waypoint, openid) => {
  const isOwner = waypoint._openid === openid;
  const isAdmin = isAdminOpenid(openid);
  const canManage = isOwner || isAdmin;
  const result = {
    ...waypoint,
    isOwner,
    isAdmin,
    canManage,
    canDelete: canManage,
  };
  if (!canManage) delete result._openid;
  return result;
};

const scopedManageCondition = (wxContext, condition) => {
  if (isAdminOpenid(wxContext.OPENID)) return condition || {};
  if (!condition) return { _openid: wxContext.OPENID };
  return _.and([{ _openid: wxContext.OPENID }, condition]);
};

const categoriesCondition = (categories) => _.or([
  { categories: _.in(categories) },
  { category: _.in(categories) },
]);

// 安全查询：任何数据库错误都返回空数组
const safeGet = async (query) => {
  try {
    return await query;
  } catch (e) {
    return { data: [] };
  }
};

// ── 附近传送点 ──
const getNearbyWaypoints = async (event) => {
  const { latitude, longitude, maxDistance = 5000, skip = 0, limit = 50 } = event;
  try {
    const result = await db.collection("waypoints")
      .where({ location: _.geoNear({ geometry: db.Geo.Point(latitude, longitude), minDistance: 0, maxDistance }) })
      .skip(skip).limit(limit).get();
    return { success: true, data: result.data };
  } catch (e) {
    console.warn('geoNear failed, fallback:', e.message);
    const result = await safeGet(db.collection("waypoints").skip(skip).limit(limit).get());
    return { success: true, data: result.data };
  }
};

// ── 搜索传送点 ──
const searchWaypoints = async (event) => {
  const { keyword = "", category = "", skip = 0, limit = 50 } = event;
  const conditions = [];
  if (keyword) conditions.push({ name: db.RegExp({ regexp: keyword, options: "i" }) });
  if (category) conditions.push({ category });
  const query = conditions.length > 0 ? _.and(conditions) : {};
  const result = await safeGet(db.collection("waypoints").where(query).skip(skip).limit(limit).get());
  return { success: true, data: result.data };
};

// ── 传送点详情 ──
const getWaypointDetail = async (event) => {
  const wxContext = cloud.getWXContext();
  const { waypointId } = event;
  try {
    const doc = await db.collection("waypoints").doc(waypointId).get();
    if (!doc.data) return { success: false, errMsg: "传送点不存在" };
    const canManage = canManageWaypoint(doc.data, wxContext.OPENID);
    if (!canManage && normalizeVisibility(doc.data.visibility) !== 'public') {
      return { success: false, errMsg: "无权查看" };
    }
    return { success: true, data: decorateWaypointForUser(doc.data, wxContext.OPENID) };
  } catch (e) { return { success: false, errMsg: "传送点不存在" }; }
};

// ── 新增传送点 ──
const addWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { name, categories, latitude, longitude, address, images, notes, tags, rating, visibility } = event;
  if (!name || !categories || categories.length === 0) {
    return { success: false, errMsg: "名称和分类为必填项" };
  }
  const now = new Date();
  const docData = {
    name, categories,
    address: address || "",
    images: images || [],
    notes: notes || "",
    tags: tags || [],
    rating: Number(rating) || 0,
    visibility: normalizeVisibility(visibility),
    _openid: wxContext.OPENID,
    create_time: now,
    update_time: now,
  };
  if (latitude != null && longitude != null) docData.location = db.Geo.Point(longitude, latitude);
  const res = await db.collection("waypoints").add({ data: docData });
  return { success: true, data: { _id: res._id } };
};

// ── 更新传送点 ──
const updateWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { waypointId, name, categories, latitude, longitude, address, images, notes, tags, rating, visibility } = event;

  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  if (!canManageWaypoint(doc.data, wxContext.OPENID)) return { success: false, errMsg: "无权修改" };

  const updateData = { update_time: new Date() };
  if (name !== undefined) updateData.name = name;
  if (categories !== undefined) updateData.categories = categories;
  if (latitude != null && longitude != null) updateData.location = db.Geo.Point(longitude, latitude);
  if (address !== undefined) updateData.address = address;
  if (images !== undefined) updateData.images = images;
  if (notes !== undefined) updateData.notes = notes;
  if (tags !== undefined) updateData.tags = tags;
  if (rating !== undefined) updateData.rating = Number(rating);
  if (visibility !== undefined) updateData.visibility = normalizeVisibility(visibility);

  await db.collection("waypoints").doc(waypointId).update({ data: updateData });
  return { success: true };
};

// ── 删除传送点 ──
const deleteWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { waypointId } = event;
  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  const docOwner = doc.data._openid || '(无)';
  const userId = wxContext.OPENID;
  if (!canManageWaypoint(doc.data, userId)) {
    return { success: false, errMsg: `无权删除 文档归属:${docOwner} 你的ID:${userId}` };
  }
  await db.collection("waypoints").doc(waypointId).remove();
  return { success: true };
};

// ── 批量删除传送点 ──
const batchDeleteWaypoints = async (event) => {
  const wxContext = cloud.getWXContext();
  const { ids } = event;
  let deleted = 0;
  for (const id of ids) {
    try {
      const doc = await db.collection("waypoints").doc(id).get();
      if (!doc.data) continue;
      if (!canManageWaypoint(doc.data, wxContext.OPENID)) continue;
      await db.collection("waypoints").doc(id).remove();
      deleted++;
    } catch (e) { /* skip single failure */ }
  }
  return { success: true, data: { deleted } };
};

// ── 我的传送点 ──
const getMyWaypoints = async (event) => {
  const wxContext = cloud.getWXContext();
  const { keyword, categories, skip = 0, limit = 500 } = event;
  const conditions = [{ _openid: wxContext.OPENID }];
  if (keyword) conditions.push({ name: db.RegExp({ regexp: keyword, options: "i" }) });
  if (categories && categories.length > 0) conditions.push(categoriesCondition(categories));
  const where = conditions.length === 1 ? conditions[0] : _.and(conditions);
  const query = db.collection("waypoints").where(where);
  const result = await query.orderBy("create_time", "desc").skip(skip).limit(limit).get();
  return { success: true, data: (result.data || []).map((wp) => decorateWaypointForUser(wp, wxContext.OPENID)) };
};

// ── 广场传送点 ──
const getSquareWaypoints = async (event) => {
  const wxContext = cloud.getWXContext();
  const { keyword, categories, skip = 0, limit = 200 } = event;
  const conditions = [{ visibility: 'public' }];
  if (keyword) conditions.push({ name: db.RegExp({ regexp: keyword, options: "i" }) });
  if (categories && categories.length > 0) conditions.push(categoriesCondition(categories));
  const where = conditions.length === 1 ? conditions[0] : _.and(conditions);
  const query = db.collection("waypoints").where(where);
  const result = await query.orderBy("create_time", "desc").skip(skip).limit(limit).get();
  return { success: true, data: (result.data || []).map((wp) => decorateWaypointForUser(wp, wxContext.OPENID)) };
};

// ── 设置页可管理传送点：普通用户只看自己的，管理员看全部 ──
const getManageWaypoints = async (event) => {
  const wxContext = cloud.getWXContext();
  const { skip = 0, limit = 500 } = event;
  let query = db.collection("waypoints");
  if (!isAdminOpenid(wxContext.OPENID)) query = query.where({ _openid: wxContext.OPENID });
  const result = await query.orderBy("create_time", "desc").skip(skip).limit(limit).get();
  return { success: true, data: (result.data || []).map((wp) => decorateWaypointForUser(wp, wxContext.OPENID)) };
};

// ── 切换发布状态 ──
const togglePublish = async (event) => {
  const wxContext = cloud.getWXContext();
  const { waypointId, visibility } = event;
  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  if (!canManageWaypoint(doc.data, wxContext.OPENID)) {
    return { success: false, errMsg: "无权操作" };
  }
  const nextVisibility = normalizeVisibility(visibility);
  await db.collection("waypoints").doc(waypointId).update({
    data: { visibility: nextVisibility, update_time: new Date() },
  });
  return { success: true, data: { visibility: nextVisibility } };
};

// ── 统计 ──
const getMyStats = async () => {
  const wxContext = cloud.getWXContext();
  try {
    const all = await db.collection("waypoints").where({ _openid: wxContext.OPENID }).get();
    const categoryCount = {};
    all.data.forEach((wp) => { categoryCount[wp.category] = (categoryCount[wp.category] || 0) + 1; });
    return { success: true, data: { total: all.data.length, categories: categoryCount } };
  } catch (e) {
    return { success: true, data: { total: 0, categories: {} } };
  }
};

// ── 获取预定义分类 ──
const getPresetCategories = async () => {
  return { success: true, data: PRESET_CATEGORIES };
};

// ── 播种测试数据 ──
const seedSamples = async () => {
  const wxContext = cloud.getWXContext();
  const now = new Date();
  const samples = [
    { name: '张记烧烤大排档', category: '美食', location: db.Geo.Point(39.9150, 116.4720), address: '朝阳区建国路88号', notes: '必点烤串和冰啤酒，周五晚上人超多', tags: ['好吃', '回头客', '深夜档'], rating: 4.5 },
    { name: '星巴克(望京店)', category: '咖啡', location: db.Geo.Point(40.0020, 116.4800), address: '望京街10号', notes: '二楼靠窗位置最舒服', tags: ['环境好', '外卖可'], rating: 4.2 },
    { name: '西山观景台', category: '风景', location: db.Geo.Point(39.9950, 116.1900), address: '海淀区香山路', notes: '秋天红叶季最美，建议工作日去人少', tags: ['风景好', '推荐'], rating: 4.8 },
    { name: '秘密基地', category: '根据地', location: db.Geo.Point(39.9420, 116.3890), address: '西城区鼓楼大街55号', notes: '藏在胡同深处的小院，有猫', tags: ['老字号', '难找'], rating: 5.0 },
    { name: '朝阳大悦城', category: '购物', location: db.Geo.Point(39.9210, 116.5170), address: '朝阳区朝阳北路101号', notes: 'B1美食广场选择超多', tags: ['品牌全', '好逛'], rating: 4.0 },
    { name: '深夜食堂', category: '美食', location: db.Geo.Point(39.9400, 116.4300), address: '东城区东直门内大街', notes: '凌晨两点还在营业的拉面馆', tags: ['深夜档', '好吃'], rating: 4.3 },
  ];

  try {
    let count = 0;
    for (const s of samples) {
      await db.collection("waypoints").add({
        data: { ...s, images: [], _openid: wxContext.OPENID, create_time: now, update_time: now },
      });
      count++;
    }
    return { success: true, data: { count, message: '已播种 ' + count + ' 个测试传送点' } };
  } catch (e) {
    return { success: false, errMsg: '播种失败: ' + (e.message || '请在云开发控制台创建 waypoints 集合') };
  }
};

// ── 批量移除标签 ──
const batchRemoveTags = async (event) => {
  const wxContext = cloud.getWXContext();
  const tagsToRemove = event.tags || [];
  if (tagsToRemove.length === 0) return { success: true, data: { count: 0 } };
  const all = await db.collection("waypoints").where(scopedManageCondition(wxContext, { tags: _.in(tagsToRemove) })).get();
  const tasks = (all.data || []).map(wp => {
    const newTags = (wp.tags || []).filter(t => !tagsToRemove.includes(t));
    return db.collection("waypoints").doc(wp._id).update({ data: { tags: newTags } });
  });
  await Promise.all(tasks);
  return { success: true, data: { count: tasks.length } };
};

// ── 批量重命名标签 ──
const batchRenameTag = async (event) => {
  const wxContext = cloud.getWXContext();
  const { oldName, newName } = event;
  const all = await db.collection("waypoints").where(scopedManageCondition(wxContext, { tags: _.in([oldName]) })).get();
  const tasks = (all.data || []).map(wp => {
    const newTags = (wp.tags || []).map(t => t === oldName ? newName : t);
    return db.collection("waypoints").doc(wp._id).update({ data: { tags: newTags } });
  });
  await Promise.all(tasks);
  return { success: true, data: { count: tasks.length } };
};

// ── 批量移除分类（从 categories 数组中移除，删光则设 ['其他']）──
const batchRemoveCategories = async (event) => {
  const wxContext = cloud.getWXContext();
  const catsToRemove = event.categories || [];
  if (catsToRemove.length === 0) return { success: true, data: { count: 0 } };
  const condition = _.or([
    { categories: _.in(catsToRemove) }, { category: _.in(catsToRemove) }
  ]);
  const all = await db.collection("waypoints").where(scopedManageCondition(wxContext, condition)).get();
  const tasks = (all.data || []).map(wp => {
    const curCats = wp.categories || (wp.category ? [wp.category] : []);
    const newCats = curCats.filter(c => !catsToRemove.includes(c));
    return db.collection("waypoints").doc(wp._id).update({ data: { categories: newCats.length > 0 ? newCats : ['其他'] } });
  });
  await Promise.all(tasks);
  return { success: true, data: { count: tasks.length } };
};

// ── 批量重命名分类 ──
const batchRenameCategory = async (event) => {
  const wxContext = cloud.getWXContext();
  const { oldName, newName } = event;
  const condition = _.or([
    { categories: _.in([oldName]) }, { category: oldName }
  ]);
  const all = await db.collection("waypoints").where(scopedManageCondition(wxContext, condition)).get();
  const tasks = (all.data || []).map(wp => {
    const curCats = wp.categories || (wp.category ? [wp.category] : []);
    const newCats = curCats.map(c => c === oldName ? newName : c);
    return db.collection("waypoints").doc(wp._id).update({ data: { categories: newCats } });
  });
  await Promise.all(tasks);
  return { success: true, data: { count: tasks.length } };
};

// ── 主入口 ──
exports.main = async (event, context) => {
  const { action } = event;
  try {
    switch (action) {
      case "ping": return { success: true, data: "pong" };
      case "getNearbyWaypoints": return await getNearbyWaypoints(event);
      case "searchWaypoints": return await searchWaypoints(event);
      case "getWaypointDetail": return await getWaypointDetail(event);
      case "addWaypoint": return await addWaypoint(event);
      case "updateWaypoint": return await updateWaypoint(event);
      case "deleteWaypoint": return await deleteWaypoint(event);
      case "batchDeleteWaypoints": return await batchDeleteWaypoints(event);
      case "getMyWaypoints": return await getMyWaypoints(event);
      case "getSquareWaypoints": return await getSquareWaypoints(event);
      case "getManageWaypoints": return await getManageWaypoints(event);
      case "togglePublish": return await togglePublish(event);
      case "getMyStats": return await getMyStats();
      case "getPresetCategories": return await getPresetCategories();
      case "seedSamples": return await seedSamples();
      case "batchRemoveTags": return await batchRemoveTags(event);
      case "batchRenameTag": return await batchRenameTag(event);
      case "batchRemoveCategories": return await batchRemoveCategories(event);
      case "batchRenameCategory": return await batchRenameCategory(event);
      default: return { success: false, errMsg: "未知操作: " + action };
    }
  } catch (e) {
    return { success: false, errMsg: e.message || "云函数内部错误" };
  }
};

exports._test = {
  normalizeVisibility,
  decorateWaypointForUser,
};
