const app = getApp();

Page({
  data: {
    stats: { total: 0, categories: [] },
    allWaypoints: [],       // 全部数据，用于统计
    waypoints: [],           // 当前筛选后的列表
    activeCategories: [],
    activeCategoryMap: {},
    loading: true,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadAll();
  },

  // 一次查询，同时得出统计和列表（保证数字一致）
  loadAll() {
    this.setData({ loading: true });
    const db = app.getDb();
    if (!db) { this.setData({ loading: false }); return; }

    db.collection('waypoints').orderBy('create_time', 'desc').limit(1000).get().then((res) => {
      const emojiMap = { '美食':'🍜','咖啡':'☕','风景':'🏔️','根据地':'🏠','购物':'🛍️','娱乐':'🎮','其他':'📍' };
      (res.data || []).forEach(wp => {
        const c0 = (wp.categories && wp.categories[0]) || wp.category || '其他';
        wp.categoryEmoji = emojiMap[c0] || '📍';
        wp.categories = wp.categories || (wp.category ? [wp.category] : ['其他']);
      });
      const all = res.data || [];

      // 统计：基础分类 + 自定义分类全部纳入（count=0 也显示），其他永远在最后
      const baseCats = ['美食','咖啡','风景','根据地','购物','娱乐','其他'];
      const storedCats = wx.getStorageSync('customCategories') || [];
      const catCount = {};
      [...baseCats, ...storedCats].forEach(c => { catCount[c] = 0; });
      all.forEach(wp => { (wp.categories||[]).forEach(c => { catCount[c] = (catCount[c] || 0) + 1; }); });
      const catList = Object.entries(catCount).map(([name, count]) => ({ name, count }));
      catList.sort((a, b) => {
        if (a.name === '其他') return 1;
        if (b.name === '其他') return -1;
        return 0;
      });

      // 筛选（多选）
      const active = this.data.activeCategories;
      const filtered = active.length > 0 ? all.filter(w => (w.categories||[]).some(c => active.includes(c))) : all;

      this.setData({
        allWaypoints: all,
        waypoints: filtered,
        stats: { total: all.length, categories: catList },
        loading: false,
      });
    }).catch(() => {
      this.setData({ allWaypoints: [], waypoints: [], loading: false });
    });
  },

  onCategoryFilter(e) {
    const cat = e.currentTarget.dataset.category;
    let active = [...this.data.activeCategories];
    if (!cat) { active = []; }
    else { const i = active.indexOf(cat); i > -1 ? active.splice(i, 1) : active.push(cat); }
    const map = {};
    active.forEach(c => map[c] = true);
    this.setData({ activeCategories: active, activeCategoryMap: map }, () => {
      const filtered = active.length > 0
        ? this.data.allWaypoints.filter(w => (w.categories||[]).some(c => active.includes(c)))
        : this.data.allWaypoints;
      this.setData({ waypoints: filtered });
    });
  },

  onWaypointTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  // ── 管理 ──
  onOpenSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

});
