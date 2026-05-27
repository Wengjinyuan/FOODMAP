const app = getApp();

Page({
  data: {
    navTop: 0,
    mode: 'view',
    waypointId: null,
    waypoint: {},
    form: {
      name: '', category: '', latitude: null, longitude: null,
      address: '', notes: '', tags: [], rating: 0, images: [],
    },
    categories: [],
    customCategory: '',
    presetTags: ['好吃', '推荐', '回头客', '环境好', '性价比高', '难找', '深夜档'],
    userTags: [],
    showUserTags: false,
    customTag: '',
    submitting: false,
    isOwner: false,
    detailMapMarkers: [],
  },

  onLoad(options) {
    const capsule = wx.getMenuButtonBoundingClientRect();
    const scale = 750 / wx.getSystemInfoSync().windowWidth;
    this.setData({ navTop: (capsule.bottom + 8) * scale });

    const { id, mode } = options;
    this.loadCategories();
    if (mode === 'add') {
      this.setData({ mode: 'add' });
      this.getCurrentLocation();
    } else if (id) {
      this.setData({ waypointId: id, mode: 'view' });
      this.loadDetail();
    }
  },

  getCurrentLocation() {
    wx.getLocation({ type: 'gcj02', success: (res) => {
      this.setData({ 'form.latitude': res.latitude, 'form.longitude': res.longitude });
    }});
  },

  // ── Categories ──
  loadCategories() {
    // 基础兜底
    const base = ['美食', '咖啡', '风景', '根据地', '购物', '娱乐', '其他'];
    this.setData({ categories: base });
    // 从数据库加载用户自定义过的分类
    const db = app.getDb();
    if (!db) return;
    db.collection('waypoints').field({ category: true, tags: true }).limit(500).get().then((res) => {
      const catSet = new Set(base);
      const tagSet = new Set();
      (res.data || []).forEach(w => {
        if (w.category) catSet.add(w.category);
        if (w.tags) w.tags.forEach(t => tagSet.add(t));
      });
      const userTags = [...tagSet].filter(t => !this.data.presetTags.includes(t));
      this.setData({ categories: [...catSet], userTags });
    }).catch(() => {});
  },

  loadDetail() {
    const db = app.getDb();
    if (!db) return;
    db.collection('waypoints').doc(this.data.waypointId).get().then((res) => {
      const wp = res.data;
      if (!wp) return;
      const loc = wp.location || {};
      const lat = loc.latitude || (loc.coordinates && loc.coordinates[1]) || 0;
      const lng = loc.longitude || (loc.coordinates && loc.coordinates[0]) || 0;
      wp.ratingRounded = Math.round(wp.rating || 0);
      wp.ratingStars = wp.rating > 0 ? '⭐'.repeat(wp.ratingRounded) : '';
      this.setData({
        waypoint: wp, isOwner: true,
        detailMapMarkers: [{ id: 1, latitude: lat, longitude: lng, iconPath: '', width: 1, height: 1,
          label: { content: wp.name, color: '#4A3A35', fontSize: 14, bgColor: '#FFFDF7', borderRadius: 8, padding: 6, display: 'ALWAYS' }
        }],
        form: {
          name: wp.name, category: wp.category,
          latitude: lat || null, longitude: lng || null,
          address: wp.address || '', notes: wp.notes || '',
          tags: wp.tags || [], rating: wp.rating || 0, images: wp.images || [],
        },
      });
      wx.setNavigationBarTitle({ title: wp.name || '传送点' });
    });
  },

  onBackToHome() { wx.switchTab({ url: '/pages/home/home' }); },
  onEdit() { this.setData({ mode: 'edit' }); },
  onCancel() {
    if (this.data.mode === 'add') wx.navigateBack();
    else { this.setData({ mode: 'view' }); this.loadDetail(); }
  },

  // ── Form ──
  onFormField(e) { this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value }); },

  // Category chip select
  onCategorySelect(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.category });
  },
  onCustomCategoryInput(e) { this.setData({ customCategory: e.detail.value }); },
  onToggleUserTags() {
    this.setData({ showUserTags: !this.data.showUserTags });
  },
  onAddCustomCategory() {
    const c = this.data.customCategory.trim();
    if (!c) return;
    this.setData({ 'form.category': c, customCategory: '' });
    if (!this.data.categories.includes(c)) {
      this.setData({ categories: [...this.data.categories, c] });
    }
  },

  // Tags
  onTagToggle(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = [...this.data.form.tags];
    const idx = tags.indexOf(tag);
    if (idx > -1) tags.splice(idx, 1);
    else { if (tags.length >= 5) return wx.showToast({ title: '最多5个标签', icon: 'none' }); tags.push(tag); }
    this.setData({ 'form.tags': tags });
  },
  onCustomTagInput(e) { this.setData({ customTag: e.detail.value }); },
  onAddCustomTag() {
    const t = this.data.customTag.trim();
    if (!t || this.data.form.tags.includes(t)) return;
    if (this.data.form.tags.length >= 5) return wx.showToast({ title: '最多5个标签', icon: 'none' });
    this.setData({ 'form.tags': [...this.data.form.tags, t], customTag: '' });
  },

  // Location
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.address': res.address || res.name,
          'form.latitude': res.latitude,
          'form.longitude': res.longitude,
        });
      },
      fail: () => { wx.showToast({ title: '请在手机端使用地图选点', icon: 'none' }); },
    });
  },

  // Images
  onChooseImage() {
    const remain = 6 - this.data.form.images.length;
    if (remain <= 0) return wx.showToast({ title: '最多6张', icon: 'none' });
    wx.chooseMedia({ count: remain, mediaType: ['image'], sizeType: ['compressed'], success: (res) => {
      wx.showLoading({ title: '上传中...' });
      const uploads = res.tempFiles.map((file) =>
        wx.cloud.uploadFile({ cloudPath: 'waypoint-images/' + Date.now() + '_' + Math.random().toString(36).substr(2,8) + '.jpg', filePath: file.tempFilePath })
      );
      Promise.all(uploads).then((results) => {
        wx.hideLoading();
        this.setData({ 'form.images': [...this.data.form.images, ...results.map(r => r.fileID)] });
      }).catch(() => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); });
    }});
  },
  onRemoveImage(e) {
    const images = [...this.data.form.images];
    images.splice(e.currentTarget.dataset.index, 1);
    this.setData({ 'form.images': images });
  },

  // Rating
  onRatingTap(e) { this.setData({ 'form.rating': Number(e.currentTarget.dataset.rating) }); },

  // Submit
  onSubmit() {
    const { form, submitting, mode, waypointId } = this.data;
    if (submitting) return;
    if (!form.name.trim()) return wx.showToast({ title: '请输入名称', icon: 'none' });
    if (!form.category) return wx.showToast({ title: '请选择分类', icon: 'none' });
    const db = app.getDb();
    if (!db) return;
    this.setData({ submitting: true });
    const data = {
      name: form.name, category: form.category,
      location: form.latitude != null ? db.Geo.Point(form.longitude, form.latitude) : undefined,
      address: form.address, notes: form.notes, tags: form.tags,
      rating: Number(form.rating) || 0, images: form.images,
      update_time: new Date(),
    };
    const promise = mode === 'add'
      ? db.collection('waypoints').add({ data: { ...data, create_time: new Date() } })
      : db.collection('waypoints').doc(waypointId).update({ data });
    promise.then(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: mode === 'add' ? '传送点已激活!' : '已更新!', icon: 'success' });
      if (mode === 'add') wx.switchTab({ url: '/pages/home/home' });
      else { this.setData({ mode: 'view' }); this.loadDetail(); }
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // Delete
  onDelete() {
    wx.showModal({
      title: '确认删除', content: '删除后无法恢复', confirmColor: '#FF6B6B',
      success: (res) => {
        if (!res.confirm) return;
        const db = app.getDb(); if (!db) return;
        db.collection('waypoints').doc(this.data.waypointId).remove().then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          wx.switchTab({ url: '/pages/home/home' });
        });
      },
    });
  },

  // Navigate
  onNavigate() {
    const wp = this.data.waypoint;
    const loc = wp.location || {};
    wx.openLocation({
      name: wp.name, address: wp.address,
      latitude: loc.latitude || (loc.coordinates && loc.coordinates[1]) || 0,
      longitude: loc.longitude || (loc.coordinates && loc.coordinates[0]) || 0,
      scale: 16,
    });
  },
});
