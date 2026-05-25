const app = getApp();

Page({
  data: {
    navTop: 0,
    mode: 'view',       // 'view' | 'edit' | 'add'
    waypointId: null,
    waypoint: {},
    form: {
      name: '', category: '', latitude: null, longitude: null,
      address: '', notes: '', tags: [], rating: 0, images: [],
    },
    categories: [],
    presetTags: ['好吃', '推荐', '回头客', '环境好', '性价比高', '难找', '深夜档'],
    customTag: '',
    submitting: false,
    isOwner: false,
  },

  onLoad(options) {
    // 适配胶囊按钮
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

  // ── Location ──
  getCurrentLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          'form.latitude': res.latitude,
          'form.longitude': res.longitude,
        });
      },
    });
  },

  // ── Data ──
  loadCategories() {
    this.setData({ categories: ['美食', '咖啡', '风景', '根据地', '购物', '娱乐', '其他'] });
  },

  loadDetail() {
    const db = app.getDb();
    if (!db) return;
    db.collection('waypoints').doc(this.data.waypointId).get().then((res) => {
      const wp = res.data;
      if (!wp) return;
      const loc = wp.location || {};
      wp.ratingRounded = Math.round(wp.rating || 0);
      wp.ratingStars = wp.rating > 0 ? '⭐'.repeat(wp.ratingRounded) : '';
      this.setData({
        waypoint: wp,
        isOwner: true,
        form: {
          name: wp.name, category: wp.category,
          latitude: loc.latitude || (loc.coordinates && loc.coordinates[1]) || null,
          longitude: loc.longitude || (loc.coordinates && loc.coordinates[0]) || null,
          address: wp.address || '', notes: wp.notes || '',
          tags: wp.tags || [], rating: wp.rating || 0, images: wp.images || [],
        },
      });
      wx.setNavigationBarTitle({ title: wp.name || '传送点' });
    });
  },

  // ── Navigation ──
  onBackToHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  // ── Mode Switching ──
  onEdit() { this.setData({ mode: 'edit' }); },
  onCancel() {
    if (this.data.mode === 'add') {
      wx.navigateBack();
    } else {
      this.setData({ mode: 'view' });
      this.loadDetail();
    }
  },

  // ── Form Fields ──
  onFormField(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },
  onCategorySelect(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.category });
  },

  // ── Tags ──
  onTagToggle(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = [...this.data.form.tags];
    const idx = tags.indexOf(tag);
    if (idx > -1) { tags.splice(idx, 1); }
    else { if (tags.length >= 5) return wx.showToast({ title: '最多5个标签', icon: 'none' }); tags.push(tag); }
    this.setData({ 'form.tags': tags });
  },
  onCustomTagInput(e) { this.setData({ customTag: e.detail.value }); },
  onAddCustomTag() {
    const t = this.data.customTag.trim();
    if (!t || this.data.form.tags.includes(t)) return;
    this.setData({ 'form.tags': [...this.data.form.tags, t], customTag: '' });
  },

  // ── Location Picker ──
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.address': res.address || res.name,
          'form.latitude': res.latitude,
          'form.longitude': res.longitude,
        });
      },
    });
  },

  // ── Images ──
  onChooseImage() {
    const remain = 6 - this.data.form.images.length;
    if (remain <= 0) return wx.showToast({ title: '最多6张', icon: 'none' });
    wx.chooseMedia({
      count: remain, mediaType: ['image'], sizeType: ['compressed'],
      success: (res) => {
        wx.showLoading({ title: '上传中...' });
        const uploads = res.tempFiles.map((file) =>
          wx.cloud.uploadFile({
            cloudPath: 'waypoint-images/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg',
            filePath: file.tempFilePath,
          })
        );
        Promise.all(uploads).then((results) => {
          wx.hideLoading();
          const newImages = [...this.data.form.images, ...results.map(r => r.fileID)];
          this.setData({ 'form.images': newImages });
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      },
    });
  },
  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index;
    const images = [...this.data.form.images];
    images.splice(idx, 1);
    this.setData({ 'form.images': images });
  },

  // ── Rating ──
  onRatingTap(e) {
    this.setData({ 'form.rating': Number(e.currentTarget.dataset.rating) });
  },

  // ── Submit ──
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
      location: form.latitude != null ? db.Geo.Point(form.latitude, form.longitude) : undefined,
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

  // ── Delete ──
  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要移除这个传送点吗？',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (!res.confirm) return;
        const db = app.getDb();
        if (!db) return;
        db.collection('waypoints').doc(this.data.waypointId).remove().then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          wx.switchTab({ url: '/pages/home/home' });
        });
      },
    });
  },

  // ── Navigate ──
  onNavigate() {
    const wp = this.data.waypoint;
    const loc = wp.location || {};
    wx.openLocation({
      name: wp.name,
      address: wp.address,
      latitude: loc.latitude || (loc.coordinates && loc.coordinates[1]) || 0,
      longitude: loc.longitude || (loc.coordinates && loc.coordinates[0]) || 0,
      scale: 16,
    });
  },
});
