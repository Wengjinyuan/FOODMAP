const app = getApp();

Page({
  data: {
    stats: { total: 0, categories: {} },
    allWaypoints: [],       // 全部数据，用于统计
    waypoints: [],           // 当前筛选后的列表
    activeCategory: '',
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
      const all = res.data || [];

      // 统计
      const catCount = {};
      all.forEach(wp => { catCount[wp.category] = (catCount[wp.category] || 0) + 1; });

      // 筛选
      const cat = this.data.activeCategory;
      const filtered = cat ? all.filter(w => w.category === cat) : all;

      this.setData({
        allWaypoints: all,
        waypoints: filtered,
        stats: { total: all.length, categories: catCount },
        loading: false,
      });
    }).catch(() => {
      this.setData({ allWaypoints: [], waypoints: [], loading: false });
    });
  },

  onCategoryFilter(e) {
    const cat = e.currentTarget.dataset.category;
    const activeCategory = this.data.activeCategory === cat ? '' : cat;
    const filtered = activeCategory
      ? this.data.allWaypoints.filter(w => w.category === activeCategory)
      : this.data.allWaypoints;
    this.setData({ activeCategory, waypoints: filtered });
  },

  onWaypointTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  // ── 管理 ──
  onOpenManage() {
    wx.showActionSheet({
      itemList: ['管理卡片（删除）', '管理标签', '管理分类'],
      success: (res) => {
        if (res.tapIndex === 0) this.onManageCards();
        else if (res.tapIndex === 1) this.onManageTags();
        else if (res.tapIndex === 2) this.onManageCategories();
      },
    });
  },

  onManageCards() {
    const items = this.data.allWaypoints.map(w => w.name + ' [' + w.category + ']');
    if (items.length === 0) return wx.showToast({ title: '没有卡片', icon: 'none' });
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const wp = this.data.allWaypoints[res.tapIndex];
        wx.showModal({
          title: '删除 ' + wp.name + '？',
          content: '删除后无法恢复',
          confirmColor: '#FF6B6B',
          success: (r) => {
            if (!r.confirm) return;
            const db = app.getDb(); if (!db) return;
            db.collection('waypoints').doc(wp._id).remove().then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadAll();
            });
          },
        });
      },
    });
  },

  onManageTags() {
    // 收集所有标签
    const allTags = new Set();
    this.data.allWaypoints.forEach(w => (w.tags || []).forEach(t => allTags.add(t)));
    const tags = [...allTags];
    if (tags.length === 0) return wx.showToast({ title: '没有自定义标签', icon: 'none' });
    wx.showActionSheet({
      itemList: tags,
      success: (res) => {
        const tag = tags[res.tapIndex];
        wx.showModal({
          title: '删除标签 "' + tag + '"？',
          content: '将从所有卡片中移除此标签',
          confirmColor: '#FF6B6B',
          success: (r) => {
            if (!r.confirm) return;
            const db = app.getDb();
            if (!db) return;
            // 更新所有包含此标签的卡片
            const _ = db.command;
            db.collection('waypoints').where({ tags: _.in([tag]) }).get().then((res2) => {
              const tasks = (res2.data || []).map(wp =>
                db.collection('waypoints').doc(wp._id).update({
                  data: { tags: (wp.tags || []).filter(t => t !== tag) }
                })
              );
              return Promise.all(tasks);
            }).then(() => {
              wx.showToast({ title: '已删除标签', icon: 'success' });
              this.loadAll();
            });
          },
        });
      },
    });
  },

  onManageCategories() {
    const cats = Object.keys(this.data.stats.categories);
    if (cats.length <= 1) return wx.showToast({ title: '至少保留1个分类', icon: 'none' });
    wx.showActionSheet({
      itemList: cats,
      success: (res) => {
        const cat = cats[res.tapIndex];
        wx.showModal({
          title: '删除分类 "' + cat + '"？',
          content: '该分类下的卡片将变为"其他"',
          confirmColor: '#FF6B6B',
          success: (r) => {
            if (!r.confirm) return;
            const db = app.getDb();
            if (!db) return;
            db.collection('waypoints').where({ category: cat }).get().then((res2) => {
              const tasks = (res2.data || []).map(wp =>
                db.collection('waypoints').doc(wp._id).update({ data: { category: '其他' } })
              );
              return Promise.all(tasks);
            }).then(() => {
              wx.showToast({ title: '已删除分类', icon: 'success' });
              this.loadAll();
            });
          },
        });
      },
    });
  },
});
