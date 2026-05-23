const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PRESET_CATEGORIES = ["美食", "咖啡", "风景", "根据地", "购物", "娱乐", "其他"];

// ── 附近传送点 ──
const getNearbyWaypoints = async (event) => {
  const { latitude, longitude, maxDistance = 5000, skip = 0, limit = 50 } = event;
  try {
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
  } catch (e) {
    // geo 索引不存在时，降级为全量查询
    console.warn('geoNear failed, falling back to full query:', e.message);
    const result = await db.collection("waypoints").skip(skip).limit(limit).get();
    return { success: true, data: result.data, fallback: true };
  }
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

  let count = 0;
  for (const s of samples) {
    await db.collection("waypoints").add({
      data: {
        ...s,
        images: [],
        _openid: wxContext.OPENID,
        create_time: now,
        update_time: now,
      },
    });
    count++;
  }
  return { success: true, data: { count, message: '已播种 ' + count + ' 个测试传送点' } };
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
    case "seedSamples": return await seedSamples();
    default: return { success: false, errMsg: "未知操作: " + action };
  }
};
