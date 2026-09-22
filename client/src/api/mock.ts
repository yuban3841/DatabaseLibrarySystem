/**
 * ClubCue 管理端 — 内置演示数据层
 *
 * 用途：后端（成员 C/D）契约未就绪前，让管理端可**独立运行、完整演示**。
 * 把 .env 里的 VITE_USE_MOCK 改成 false 即切换到真实后端，页面代码零改动。
 *
 * 重要：mock 里严格复现后端应有的业务规则（名额不超卖、候补按序号转正、
 * 重复报名唯一约束），避免演示时出现"看着能点但其实逻辑是错的"的情况。
 *
 * 数据保存在 localStorage，刷新不丢；需要还原时调用 resetDb()。
 */
import dayjs from 'dayjs';
import type {
  Activity,
  ActivityCategory,
  ActivityComparisonRow,
  ActivityFormPayload,
  ActivityListParams,
  ActivityStatus,
  BatchReviewPayload,
  CheckinBoardResult,
  CheckinCodeResult,
  CheckinRecord,
  DashboardStats,
  LoginPayload,
  LoginResult,
  ManualCheckinPayload,
  Paged,
  Registration,
  RegistrationListParams,
  RegistrationStatus,
  ReviewPayload,
  ScanCheckinPayload,
  User,
} from '../types';
import { ApiError } from './http';

// ---------------- 基础设施 ----------------

const DB_KEY = 'clubcue-admin-mock-db-v1';
const CURRENT_USER_KEY = 'clubcue-admin-mock-user';
const DB_VERSION = 2;

interface MockDb {
  version: number;
  seq: number;
  users: User[];
  activities: Activity[];
  registrations: Registration[];
  checkins: CheckinRecord[];
  /** 演示账号（账号 → 用户 + 口令），仅 mock 使用 */
  accounts: { account: string; userId: string; password: string }[];
}

const HOUR = 3600_000;

function nowOffset(minutes: number): string {
  return dayjs().add(minutes, 'minute').format('YYYY-MM-DD HH:mm:ss');
}

function delay(ms?: number): Promise<void> {
  const wait = ms ?? 150 + Math.random() * 200;
  return new Promise((resolve) => setTimeout(resolve, wait));
}

function paginate<T>(rows: T[], page: number, pageSize: number): Paged<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    data: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: { page: safePage, pageSize, total, totalPages },
  };
}

function nextId(db: MockDb, prefix: string): string {
  db.seq += 1;
  return `${prefix}${String(db.seq).padStart(5, '0')}`;
}

// ---------------- 种子数据 ----------------

const SURNAMES = ['张', '王', '李', '赵', '陈', '刘', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗'];
const GIVEN = ['浩然', '子涵', '欣怡', '梓萱', '宇轩', '思远', '嘉懿', '若曦', '博文', '明轩', '雨桐', '一诺', '沐辰', '诗涵', '泽楷', '语嫣', '皓宇', '静怡', '俊杰', '雅琪'];
const COLLEGES = ['计算机学院', '信息工程学院', '机械工程学院', '外语学院', '经济与管理学院', '材料与化学工程学院'];

const PARTICIPANT_POOL_SIZE = 320;

function buildParticipants(count: number): User[] {
  const users: User[] = [];
  for (let i = 0; i < count; i++) {
    users.push({
      userId: `U-${String(1000 + i).padStart(5, '0')}`,
      studentId: `2405${String(6000 + i * 7)}`,
      name: SURNAMES[i % SURNAMES.length] + GIVEN[(i * 7) % GIVEN.length],
      college: COLLEGES[i % COLLEGES.length],
      role: 'USER',
      status: 'ACTIVE',
      permissions: ['registration:submit'],
      createdAt: nowOffset(-(30 - i) * 24 * 60),
    });
  }
  return users;
}

function ticketOf(activityId: string, userId: string): string {
  // 票码仅用于演示；后端应为不可猜的随机码 + 唯一索引
  return `TK-${activityId.slice(-4)}-${userId.slice(-4)}-${String(Math.abs(activityId.charCodeAt(4) * 7 + userId.length * 3)).padStart(4, '0')}`;
}

/** 为一个活动批量生成报名数据；同一活动内学号不重复（模拟唯一索引） */
function genRegistrations(
  db: MockDb,
  activityId: string,
  opts: { offset: number; approved: number; pending: number; rejected: number; waiting: number }
): void {
  const pool = buildParticipants(PARTICIPANT_POOL_SIZE);
  let cursor = opts.offset;
  const push = (status: RegistrationStatus, waitingNo: number | null = null) => {
    const u = pool[cursor % pool.length];
    cursor += 1;
    const approved = status === 'APPROVED';
    db.registrations.push({
      registrationId: nextId(db, 'REG-'),
      activityId,
      userId: u.userId,
      studentId: u.studentId,
      name: u.name,
      college: u.college,
      status,
      waitingNo,
      ticketCode: approved ? ticketOf(activityId, u.userId) : null,
      rejectReason: status === 'REJECTED' ? '名额已满，建议关注后续同类活动' : undefined,
      createdAt: nowOffset(-((cursor % 13) + 1) * 60 * 22 - (cursor % 7) * 9),
      reviewedAt: status === 'APPROVED' || status === 'REJECTED' ? nowOffset(-((cursor % 9) + 1) * 60 * 5) : undefined,
      reviewerName: status === 'APPROVED' || status === 'REJECTED' ? '陈明轩' : undefined,
    });
  };

  for (let i = 0; i < opts.approved; i++) push('APPROVED');
  for (let i = 0; i < opts.waiting; i++) push('WAITING', i + 1);
  for (let i = 0; i < opts.pending; i++) push('PENDING');
  for (let i = 0; i < opts.rejected; i++) push('REJECTED');
}

function buildSeed(): MockDb {
  const db: MockDb = {
    version: DB_VERSION,
    seq: 0,
    users: [
      {
        userId: 'U-00001',
        studentId: '24050814',
        name: '陈明轩',
        college: '计算机学院',
        role: 'ADMIN',
        status: 'ACTIVE',
        permissions: ['activity:manage', 'registration:review', 'registration:export', 'checkin:manage', 'statistics:view'],
        createdAt: nowOffset(-90 * 24 * 60),
      },
      {
        userId: 'U-00002',
        studentId: '24050610',
        name: '李思涵',
        college: '信息工程学院',
        role: 'ORGANIZER',
        status: 'ACTIVE',
        permissions: ['activity:manage', 'registration:review', 'registration:export', 'checkin:manage', 'statistics:view'],
        createdAt: nowOffset(-70 * 24 * 60),
      },
      {
        userId: 'U-00003',
        studentId: '24050922',
        name: '王禹涵',
        college: '计算机学院',
        role: 'USER',
        status: 'ACTIVE',
        permissions: ['registration:submit'],
        createdAt: nowOffset(-20 * 24 * 60),
      },
    ],
    activities: [],
    registrations: [],
    checkins: [],
    accounts: [
      { account: 'admin', userId: 'U-00001', password: 'admin123' },
      { account: 'org01', userId: 'U-00002', password: 'org123' },
      { account: 'u24050814', userId: 'U-00003', password: 'user123' },
    ],
  };

  const admin = db.users[0];
  const organizer = db.users[1];
  const activity = (partial: Omit<Activity, 'enrolled' | 'waiting'> & { enrolled?: number; waiting?: number }): Activity => ({
    enrolled: 0,
    waiting: 0,
    ...partial,
  });

  db.activities.push(
    activity({
      activityId: 'ACT-1001',
      title: '第12届校园马拉松',
      description: '沿钱塘江岸环线 5 公里，完赛颁发纪念奖牌，前 50 名完赛者可参与抽奖。',
      cover: 'https://picsum.photos/seed/clubcue-marathon/640/360',
      category: '体育',
      capacity: 120,
      auditRequired: false,
      startTime: nowOffset(3 * 24 * 60 + 60),
      endTime: nowOffset(3 * 24 * 60 + 150),
      registerDeadline: nowOffset(24 * 60 + 120),
      location: '之江校区田径场',
      latitude: 30.2001,
      longitude: 120.0967,
      status: 'PUBLISHED',
      creatorId: admin.userId,
      creatorName: admin.name,
      createdAt: nowOffset(-9 * 24 * 60),
      updatedAt: nowOffset(-2 * 24 * 60),
    }),
    activity({
      activityId: 'ACT-1002',
      title: '迎新晚会节目征集',
      description: '面向全校社团征集合唱、舞蹈、小品等节目，经审核通过后进入彩排名单。',
      cover: 'https://picsum.photos/seed/clubcue-welcome/640/360',
      category: '文艺',
      capacity: 30,
      auditRequired: true,
      startTime: nowOffset(5 * 24 * 60 + 480),
      endTime: nowOffset(5 * 24 * 60 + 570),
      registerDeadline: nowOffset(12 * 60),
      location: '学生活动中心大礼堂',
      status: 'PUBLISHED',
      creatorId: organizer.userId,
      creatorName: organizer.name,
      createdAt: nowOffset(-6 * 24 * 60),
      updatedAt: nowOffset(-3 * 24 * 60),
    }),
    activity({
      activityId: 'ACT-1003',
      title: '数据库原理工作坊',
      description: '现场实操 MySQL 索引与事务，名额有限，满员后进入候补队列。',
      cover: 'https://picsum.photos/seed/clubcue-mysql/640/360',
      category: '学术',
      capacity: 40,
      auditRequired: false,
      startTime: nowOffset(-60),
      endTime: nowOffset(120),
      registerDeadline: nowOffset(-24 * 60),
      location: '主楼 A302 机房',
      status: 'PUBLISHED',
      creatorId: admin.userId,
      creatorName: admin.name,
      createdAt: nowOffset(-4 * 24 * 60),
      updatedAt: nowOffset(-26 * 60),
    }),
    activity({
      activityId: 'ACT-1004',
      title: '暑期支教志愿者招募',
      description: '前往省内乡镇中小学开展为期两周的支教活动，需面试。',
      cover: 'https://picsum.photos/seed/clubcue-volunteer/640/360',
      category: '志愿',
      capacity: 60,
      auditRequired: true,
      startTime: nowOffset(12 * 24 * 60),
      endTime: nowOffset(12 * 24 * 60 + 180),
      registerDeadline: nowOffset(4 * 24 * 60),
      location: '行政楼 105 会议室（面试地点）',
      status: 'DRAFT',
      creatorId: organizer.userId,
      creatorName: organizer.name,
      createdAt: nowOffset(-2 * 24 * 60),
      updatedAt: nowOffset(-2 * 24 * 60),
    }),
    activity({
      activityId: 'ACT-1005',
      title: '桌游社线下例会',
      description: '新人欢迎局，提供狼人杀与阿瓦隆，自带骰子优先入座。',
      cover: 'https://picsum.photos/seed/clubcue-boardgame/640/360',
      category: '其他',
      capacity: 25,
      auditRequired: false,
      startTime: nowOffset(-40 * 24 * 60),
      endTime: nowOffset(-40 * 24 * 60 + 180),
      registerDeadline: nowOffset(-41 * 24 * 60),
      location: '学生公寓 7 号楼活动室',
      status: 'OFFLINE',
      creatorId: organizer.userId,
      creatorName: organizer.name,
      createdAt: nowOffset(-50 * 24 * 60),
      updatedAt: nowOffset(-40 * 24 * 60),
    }),
    activity({
      activityId: 'ACT-1006',
      title: '新生军训慰问演出',
      description: '上一届留存记录，用于演示归档态活动的统计口径。',
      cover: 'https://picsum.photos/seed/clubcue-military/640/360',
      category: '文艺',
      capacity: 200,
      auditRequired: false,
      startTime: nowOffset(-70 * 24 * 60),
      endTime: nowOffset(-70 * 24 * 60 + 240),
      registerDeadline: nowOffset(-72 * 24 * 60),
      location: '露天舞台',
      status: 'ARCHIVED',
      creatorId: admin.userId,
      creatorName: admin.name,
      createdAt: nowOffset(-80 * 24 * 60),
      updatedAt: nowOffset(-70 * 24 * 60),
    })
  );

  genRegistrations(db, 'ACT-1001', { offset: 0, approved: 48, pending: 0, rejected: 0, waiting: 0 });
  // ACT-1002：审核制，名额已满 30 + 候补 4 + 待审核 6 + 已驳回 2
  genRegistrations(db, 'ACT-1002', { offset: 50, approved: 30, pending: 6, rejected: 2, waiting: 4 });
  // ACT-1003：进行中活动，名额已满 + 候补队列，用于演示"驳回到候补转正"
  genRegistrations(db, 'ACT-1003', { offset: 100, approved: 40, pending: 0, rejected: 0, waiting: 3 });
  genRegistrations(db, 'ACT-1005', { offset: 150, approved: 18, pending: 0, rejected: 0, waiting: 0 });
  genRegistrations(db, 'ACT-1006', { offset: 200, approved: 150, pending: 0, rejected: 0, waiting: 0 });

  db.seq += 1000;

  // ACT-1003 现场签到 23 人（活动进行中，用于实时看板）
  const a1003Approved = db.registrations.filter((r) => r.activityId === 'ACT-1003' && r.status === 'APPROVED').slice(0, 23);
  a1003Approved.forEach((r, i) => {
    db.checkins.push({
      checkinId: nextId(db, 'CHK-'),
      activityId: 'ACT-1003',
      registrationId: r.registrationId,
      userId: r.userId,
      name: r.name,
      studentId: r.studentId,
      method: i % 6 === 0 ? 'MANUAL' : 'SCAN',
      checkinTime: nowOffset(-45 + i * 2),
      operatorName: i % 6 === 0 ? admin.name : undefined,
    });
  });

  // ACT-1006 归档活动的历史签到
  db.registrations
    .filter((r) => r.activityId === 'ACT-1006' && r.status === 'APPROVED')
    .slice(0, 132)
    .forEach((r, i) => {
      db.checkins.push({
        checkinId: nextId(db, 'CHK-'),
        activityId: 'ACT-1006',
        registrationId: r.registrationId,
        userId: r.userId,
        name: r.name,
        studentId: r.studentId,
        method: 'SCAN',
        checkinTime: nowOffset(-70 * 24 * 60 + 30 + i * 3),
      });
    });

  syncAllCounters(db);
  return db;
}

// ---------------- 持久化 ----------------

let cache: MockDb | null = null;

function load(): MockDb {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed.version === DB_VERSION) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    // 数据损坏则重建，保证演示可用
  }
  const fresh = buildSeed();
  cache = fresh;
  localStorage.setItem(DB_KEY, JSON.stringify(fresh));
  return fresh;
}

function persist(): void {
  if (cache) localStorage.setItem(DB_KEY, JSON.stringify(cache));
}

export function resetDb(): void {
  cache = buildSeed();
  persist();
}

function currentUser(): User | null {
  const userId = localStorage.getItem(CURRENT_USER_KEY);
  if (!userId) return null;
  return load().users.find((u) => u.userId === userId) ?? null;
}

function requireUser(): User {
  const user = currentUser();
  if (!user) throw new ApiError('登录态已失效，请重新登录', 401);
  return user;
}

function requireActivity(activityId: string): Activity {
  const activity = load().activities.find((a) => a.activityId === activityId && !a.deletedAt);
  if (!activity) throw new ApiError('活动不存在或已删除', 404);
  return activity;
}

// ---------------- 业务规则（与后端契约一致） ----------------

/** 依据报名数据重算活动计数，杜绝 enrolled/waiting 与实际记录脱节 */
function syncCounters(db: MockDb, activityId: string): void {
  const activity = db.activities.find((a) => a.activityId === activityId);
  if (!activity) return;
  const regs = db.registrations.filter((r) => r.activityId === activityId);
  activity.enrolled = regs.filter((r) => r.status === 'APPROVED').length;
  activity.waiting = regs.filter((r) => r.status === 'WAITING').length;
  activity.updatedAt = nowOffset(0);
}

function syncAllCounters(db: MockDb): void {
  db.activities.forEach((a) => syncCounters(db, a.activityId));
}

/**
 * 候补转正：名额有富余时，按 waitingNo 升序把最早的候补转为通过。
 * 名额已满时是空操作。
 */
function promoteWaiting(db: MockDb, activityId: string, reviewerName: string): Registration | null {
  const activity = db.activities.find((a) => a.activityId === activityId);
  if (!activity) return null;
  if (activity.enrolled >= activity.capacity) return null;

  const next = db.registrations
    .filter((r) => r.activityId === activityId && r.status === 'WAITING')
    .sort((a, b) => (a.waitingNo ?? 0) - (b.waitingNo ?? 0))[0];
  if (!next) return null;

  next.status = 'APPROVED';
  next.waitingNo = null;
  next.ticketCode = ticketOf(activityId, next.userId);
  next.reviewedAt = nowOffset(0);
  next.reviewerName = reviewerName;
  next.rejectReason = undefined;
  syncCounters(db, activityId);
  return next;
}

/** 单条审核的公共实现 —— 所有审核入口都走这里，避免多套计数逻辑 */
function doReview(db: MockDb, registration: Registration, payload: ReviewPayload, reviewer: User): Registration {
  const { action } = payload;

  if (action === 'APPROVE') {
    if (registration.status === 'APPROVED') throw new ApiError('该报名已通过，无需重复审核', 409);
    if (registration.status === 'CANCELLED') throw new ApiError('该报名已取消，不能通过', 409);
    if (registration.status === 'REJECTED') throw new ApiError('该报名已驳回，请先在用户端重新报名', 409);
    const activity = db.activities.find((a) => a.activityId === registration.activityId);
    if (!activity) throw new ApiError('活动不存在', 404);
    if (activity.enrolled >= activity.capacity) {
      throw new ApiError(`名额已满（${activity.enrolled}/${activity.capacity}），无法通过`, 409);
    }
    registration.status = 'APPROVED';
    registration.waitingNo = null;
    registration.ticketCode = ticketOf(registration.activityId, registration.userId);
    registration.rejectReason = undefined;
    registration.reviewedAt = nowOffset(0);
    registration.reviewerName = reviewer.name;
    syncCounters(db, registration.activityId);
    return registration;
  }

  // REJECT
  if (registration.status === 'REJECTED') throw new ApiError('该报名已驳回', 409);
  if (!payload.reason?.trim()) throw new ApiError('驳回必须填写理由', 400);
  registration.status = 'REJECTED';
  registration.rejectReason = payload.reason.trim();
  registration.ticketCode = null;
  registration.reviewedAt = nowOffset(0);
  registration.reviewerName = reviewer.name;
  syncCounters(db, registration.activityId);
  // 释放名额后尝试候补转正
  promoteWaiting(db, registration.activityId, reviewer.name);
  return registration;
}

function findRegistration(registrationId: string): Registration {
  const found = load().registrations.find((r) => r.registrationId === registrationId);
  if (!found) throw new ApiError('报名记录不存在', 404);
  return found;
}

// ---------------- 认证 ----------------

export async function mockLogin(payload: LoginPayload): Promise<LoginResult> {
  await delay();
  const db = load();
  const username = payload.username.trim();
  // 账号名与学号都可登录；错误信息统一模糊化，不透露账号是否存在
  const account = db.accounts.find((a) => a.account === username);
  if (!account || account.password !== payload.password) throw new ApiError('账号或密码错误', 401);
  const user = db.users.find((u) => u.userId === account.userId);
  if (!user) throw new ApiError('账号或密码错误', 401);
  if (user.status !== 'ACTIVE') throw new ApiError('账号已被禁用', 403);

  localStorage.setItem(CURRENT_USER_KEY, user.userId);
  return {
    token: `mock-token-${user.userId}`,
    expiresIn: 7200,
    user: { ...user },
  };
}

export async function mockMe(): Promise<User> {
  await delay(80);
  return requireUser();
}

export async function mockLogout(): Promise<void> {
  await delay(80);
  localStorage.removeItem(CURRENT_USER_KEY);
}

// ---------------- 活动 ----------------

export const CATEGORIES: ActivityCategory[] = ['体育', '文艺', '学术', '志愿', '其他'];

export async function mockListActivities(params: ActivityListParams): Promise<Paged<Activity>> {
  await delay();
  const db = load();
  let rows = db.activities.filter((a) => !a.deletedAt);

  if (params.keyword?.trim()) {
    const kw = params.keyword.trim().toLowerCase();
    rows = rows.filter((a) => a.title.toLowerCase().includes(kw) || a.location.toLowerCase().includes(kw));
  }
  if (params.category) rows = rows.filter((a) => a.category === params.category);
  if (params.status) rows = rows.filter((a) => a.status === params.status);

  rows = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginate(rows, params.page ?? 1, params.pageSize ?? 10);
}

export async function mockGetActivity(activityId: string): Promise<Activity> {
  await delay(100);
  return requireActivity(activityId);
}

export async function mockCreateActivity(payload: ActivityFormPayload, actor?: User): Promise<Activity> {
  await delay();
  const db = load();
  const user = actor ?? requireUser();
  if (!payload.title.trim()) throw new ApiError('标题必填', 400);
  if (payload.capacity < 1) throw new ApiError('名额上限必须大于 0', 400);
  if (db.activities.some((a) => !a.deletedAt && a.title === payload.title.trim())) {
    throw new ApiError('已存在同名活动', 409);
  }
  const activity: Activity = {
    ...payload,
    title: payload.title.trim(),
    activityId: nextId(db, 'ACT-'),
    enrolled: 0,
    waiting: 0,
    status: 'DRAFT',
    creatorId: user.userId,
    creatorName: user.name,
    createdAt: nowOffset(0),
    updatedAt: nowOffset(0),
  };
  db.activities.push(activity);
  persist();
  return { ...activity };
}

/**
 * 编辑活动。按状态限制可改字段：
 *   DRAFT / OFFLINE —— 全部字段
 *   PUBLISHED       —— 仅 标题 / 描述 / 封面 / 地点
 *   ARCHIVED        —— 不允许修改
 */
export async function mockUpdateActivity(activityId: string, payload: ActivityFormPayload): Promise<Activity> {
  await delay();
  const db = load();
  const activity = requireActivity(activityId);
  requireUser();

  if (activity.status === 'ARCHIVED') throw new ApiError('已归档活动不可修改', 409);

  const editable = activity.status === 'PUBLISHED';
  const patch: Partial<Activity> = editable
    ? { title: payload.title.trim(), description: payload.description, cover: payload.cover, location: payload.location }
    : { ...payload, title: payload.title.trim() };

  if (activity.status === 'PUBLISHED') {
    const frozen: Array<{ key: keyof ActivityFormPayload; label: string; origin: string | number | boolean }> = [
      { key: 'capacity', label: '名额上限', origin: activity.capacity },
      { key: 'auditRequired', label: '审核制', origin: activity.auditRequired },
      { key: 'startTime', label: '活动时间', origin: activity.startTime },
      { key: 'endTime', label: '活动时间', origin: activity.endTime },
      { key: 'registerDeadline', label: '报名截止', origin: activity.registerDeadline },
      { key: 'category', label: '活动分类', origin: activity.category },
    ];
    const changed = frozen.filter((f) => f.origin !== payload[f.key]).map((f) => f.label);
    if (changed.length) throw new ApiError(`已发布活动的 ${changed.join('、')} 不可修改（下架后可改）`, 409);
  }

  Object.assign(activity, patch, { updatedAt: nowOffset(0) });
  persist();
  return { ...activity };
}

export async function mockPublishActivity(activityId: string): Promise<Activity> {
  await delay();
  const db = load();
  const activity = requireActivity(activityId);
  if (activity.status === 'PUBLISHED') throw new ApiError('活动已是发布状态', 409);
  if (activity.status === 'ARCHIVED') throw new ApiError('已归档活动不能重新发布', 409);
  if (!activity.title.trim()) throw new ApiError('标题不能为空', 400);
  activity.status = 'PUBLISHED';
  activity.updatedAt = nowOffset(0);
  persist();
  return { ...activity };
}

/** 下架：仅停止新报名，已有报名与签到仍然有效 */
export async function mockOfflineActivity(activityId: string): Promise<Activity> {
  await delay();
  const db = load();
  const activity = requireActivity(activityId);
  if (activity.status !== 'PUBLISHED') throw new ApiError('仅已发布活动可下架', 409);
  activity.status = 'OFFLINE';
  activity.updatedAt = nowOffset(0);
  persist();
  return { ...activity };
}

/** 复制活动：生成草稿，不复制报名与签到数据 */
export async function mockCopyActivity(activityId: string): Promise<Activity> {
  await delay();
  const db = load();
  const source = requireActivity(activityId);
  const copy: Activity = {
    ...source,
    activityId: nextId(db, 'ACT-'),
    title: `${source.title}（副本）`,
    enrolled: 0,
    waiting: 0,
    status: 'DRAFT',
    createdAt: nowOffset(0),
    updatedAt: nowOffset(0),
  };
  db.activities.push(copy);
  persist();
  return { ...copy };
}

/** 逻辑删除：写入 deletedAt，不物理删除，保留关联报名与签到数据 */
export async function mockRemoveActivity(activityId: string): Promise<void> {
  await delay();
  const db = load();
  const activity = requireActivity(activityId);
  activity.deletedAt = nowOffset(0);
  persist();
}

// ---------------- 报名 ----------------

export async function mockListRegistrations(
  activityId: string,
  params: RegistrationListParams
): Promise<Paged<Registration>> {
  await delay();
  const db = load();
  requireActivity(activityId);

  let rows = db.registrations.filter((r) => r.activityId === activityId);
  if (params.status) rows = rows.filter((r) => r.status === params.status);
  if (params.keyword?.trim()) {
    const kw = params.keyword.trim().toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(kw) || r.studentId.toLowerCase().includes(kw));
  }

  const byWaiting = params.sort === 'waitingNo';
  const dir = params.order === 'ASC' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    if (byWaiting) {
      const na = a.waitingNo ?? Number.MAX_SAFE_INTEGER;
      const nb = b.waitingNo ?? Number.MAX_SAFE_INTEGER;
      if (na !== nb) return (na - nb) * dir;
    }
    return b.createdAt.localeCompare(a.createdAt) * dir;
  });

  return paginate(rows, params.page ?? 1, params.pageSize ?? 10);
}

export async function mockReviewRegistration(registrationId: string, payload: ReviewPayload): Promise<Registration> {
  await delay();
  const db = load();
  const reviewer = requireUser();
  const registration = findRegistration(registrationId);
  return { ...doReview(db, registration, payload, reviewer) };
}

export async function mockBatchReview(payload: BatchReviewPayload): Promise<{ succeeded: number; skipped: number }> {
  await delay();
  const db = load();
  const reviewer = requireUser();
  if (!payload.registrationIds.length) throw new ApiError('请选择要审核的报名', 400);
  if (payload.action === 'REJECT' && !payload.reason?.trim()) throw new ApiError('批量驳回必须填写理由', 400);

  let succeeded = 0;
  let skipped = 0;
  // 逐条处理；单条失败不影响其它条（与后端的逐行事务一致）
  for (const id of payload.registrationIds) {
    try {
      const registration = findRegistration(id);
      if (registration.status === 'CANCELLED') {
        skipped += 1;
        continue;
      }
      doReview(db, registration, payload, reviewer);
      succeeded += 1;
    } catch {
      skipped += 1;
    }
  }
  persist();
  return { succeeded, skipped };
}

/** 手动递补：把指定候补转正（名额富余时） */
export async function mockPromoteRegistration(registrationId: string): Promise<Registration> {
  await delay();
  const db = load();
  const reviewer = requireUser();
  const registration = findRegistration(registrationId);
  if (registration.status !== 'WAITING') throw new ApiError('只有候补状态的报名可以递补', 409);

  const activity = db.activities.find((a) => a.activityId === registration.activityId);
  if (!activity) throw new ApiError('活动不存在', 404);
  if (activity.enrolled >= activity.capacity) {
    throw new ApiError(`名额已满（${activity.enrolled}/${activity.capacity}），无法递补`, 409);
  }

  registration.status = 'APPROVED';
  registration.waitingNo = null;
  registration.ticketCode = ticketOf(registration.activityId, registration.userId);
  registration.reviewedAt = nowOffset(0);
  registration.reviewerName = reviewer.name;
  syncCounters(db, registration.activityId);
  persist();
  return { ...registration };
}

/** 导出用：按当前筛选条件返回全量数据 */
export async function mockExportRegistrations(
  activityId: string,
  params: RegistrationListParams
): Promise<Registration[]> {
  await delay();
  const result = await mockListRegistrations(activityId, {
    page: 1,
    pageSize: 100000,
    status: params.status,
    keyword: params.keyword,
    sort: params.sort,
    order: params.order,
  });
  return result.data;
}

// ---------------- 签到 ----------------

const CODE_TTL_SECONDS = 60;

export async function mockIssueCheckinCode(activityId: string): Promise<CheckinCodeResult> {
  await delay(120);
  const activity = requireActivity(activityId);
  const now = Date.now();
  const expiresAt = now + CODE_TTL_SECONDS * 1000;
  // 载荷为纯 ASCII 的 JSON，可直接 base64；真实环境应由后端签名后下发
  const payload = btoa(JSON.stringify({ aid: activityId, exp: expiresAt }));
  return {
    payload,
    expiresInSeconds: CODE_TTL_SECONDS,
    checkinWindow: `${activity.startTime} ~ ${activity.endTime}`,
  };
}

/** 扫码签到：校验票码、资格、时间窗与重复签到 */
export async function mockScanCheckin(payload: ScanCheckinPayload): Promise<CheckinRecord> {
  await delay();
  const db = load();
  const activity = requireActivity(payload.activityId);
  const registration = db.registrations.find(
    (r) => r.activityId === activity.activityId && r.ticketCode === payload.ticketCode.trim()
  );
  if (!registration) throw new ApiError('票码无效，未找到对应报名', 404);
  if (registration.status !== 'APPROVED') throw new ApiError('该报名未通过审核，不可签到', 409);

  const now = Date.now();
  const start = dayjs(activity.startTime).valueOf() - 30 * 60_000;
  const end = dayjs(activity.endTime).valueOf() + 30 * 60_000;
  if (now < start) throw new ApiError('签到尚未开始', 409);
  if (now > end) throw new ApiError('签到已结束', 409);

  const existed = db.checkins.some((c) => c.registrationId === registration.registrationId);
  if (existed) throw new ApiError('该同学已签到，请勿重复签到', 409);

  const record: CheckinRecord = {
    checkinId: nextId(db, 'CHK-'),
    activityId: activity.activityId,
    registrationId: registration.registrationId,
    userId: registration.userId,
    name: registration.name,
    studentId: registration.studentId,
    method: 'SCAN',
    checkinTime: nowOffset(0),
  };
  db.checkins.push(record);
  persist();
  return { ...record };
}

export async function mockManualCheckin(payload: ManualCheckinPayload): Promise<CheckinRecord> {
  await delay();
  const db = load();
  const operator = requireUser();
  const activity = requireActivity(payload.activityId);
  if (!payload.operatorName.trim()) throw new ApiError('操作人必填', 400);

  const registration = db.registrations.find(
    (r) => r.activityId === activity.activityId && r.userId === payload.userId && r.status === 'APPROVED'
  );
  if (!registration) throw new ApiError('该用户没有通过审核的报名记录，不可补签', 409);
  if (db.checkins.some((c) => c.registrationId === registration.registrationId)) {
    throw new ApiError('该同学已签到，无需补签', 409);
  }

  const record: CheckinRecord = {
    checkinId: nextId(db, 'CHK-'),
    activityId: activity.activityId,
    registrationId: registration.registrationId,
    userId: registration.userId,
    name: registration.name,
    studentId: registration.studentId,
    method: 'MANUAL',
    checkinTime: nowOffset(0),
    operatorName: payload.operatorName.trim(),
  };
  db.checkins.push(record);
  persist();
  return { ...record };
}

export async function mockListCheckins(
  activityId: string,
  params: { page?: number; pageSize?: number }
): Promise<Paged<CheckinRecord>> {
  await delay();
  const db = load();
  requireActivity(activityId);
  const rows = db.checkins
    .filter((c) => c.activityId === activityId)
    .sort((a, b) => b.checkinTime.localeCompare(a.checkinTime));
  return paginate(rows, params.page ?? 1, params.pageSize ?? 10);
}

/**
 * 实时看板。mock 模式下按一定概率模拟一名已批准未签到的同学现场签到，
 * 用于演示"5 秒轮询看板数字滚动"的效果；真实后端只需返回实时聚合结果。
 */
export async function mockCheckinBoard(activityId: string): Promise<CheckinBoardResult> {
  await delay(90);
  const db = load();
  const activity = requireActivity(activityId);
  const approved = db.registrations.filter((r) => r.activityId === activityId && r.status === 'APPROVED');
  const checked = db.checkins.filter((c) => c.activityId === activityId);

  // 模拟现场签到：仅进行中活动，且存在未签到者
  if (activity.status === 'PUBLISHED' && Math.random() < 0.45) {
    const remaining = approved.filter((r) => !checked.some((c) => c.registrationId === r.registrationId));
    if (remaining.length) {
      const target = remaining[Math.floor(Math.random() * remaining.length)];
      db.checkins.push({
        checkinId: nextId(db, 'CHK-'),
        activityId,
        registrationId: target.registrationId,
        userId: target.userId,
        name: target.name,
        studentId: target.studentId,
        method: 'SCAN',
        checkinTime: nowOffset(0),
      });
      persist();
    }
  }

  const checkedIn = db.checkins.filter((c) => c.activityId === activityId);
  const rate = approved.length ? Math.round((checkedIn.length / approved.length) * 100) : 0;
  return {
    activityId,
    activityTitle: activity.title,
    capacity: activity.capacity,
    approved: approved.length,
    checkedIn: checkedIn.length,
    checkinRate: rate,
    latest: checkedIn.sort((a, b) => b.checkinTime.localeCompare(a.checkinTime)).slice(0, 10),
  };
}

// ---------------- 统计 ----------------

export async function mockDashboard(): Promise<DashboardStats> {
  await delay();
  const db = load();
  const activities = db.activities.filter((a) => !a.deletedAt);
  const now = dayjs();

  const trend: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = now.clone().subtract(i, 'day').startOf('day');
    const nextDay = day.clone().add(1, 'day');
    trend.push({
      date: day.format('MM-DD'),
      count: db.registrations.filter((r) => {
        const t = dayjs(r.createdAt);
        return t.isAfter(day) && t.isBefore(nextDay);
      }).length,
    });
  }

  const byCategory = CATEGORIES.map((category) => ({
    category,
    count: activities.filter((a) => a.category === category).length,
  }));

  return {
    activityCount: activities.length,
    publishedCount: activities.filter((a) => a.status === 'PUBLISHED').length,
    totalRegistration: db.registrations.length,
    pendingReview: db.registrations.filter((r) => r.status === 'PENDING').length,
    todayCheckin: db.checkins.filter((c) => dayjs(c.checkinTime).isSame(now, 'day')).length,
    avgCheckinRate: (() => {
      const finished = activities.filter((a) => a.status !== 'DRAFT' && a.enrolled > 0);
      if (!finished.length) return 0;
      const total = finished.reduce((sum, a) => {
        const approved = db.registrations.filter((r) => r.activityId === a.activityId && r.status === 'APPROVED').length;
        const checked = db.checkins.filter((c) => c.activityId === a.activityId).length;
        return sum + (approved ? checked / approved : 0);
      }, 0);
      return Math.round((total / finished.length) * 100);
    })(),
    registrationTrend: trend,
    categoryDistribution: byCategory,
    hotActivities: [...activities]
      .sort((a, b) => b.enrolled - a.enrolled)
      .slice(0, 5)
      .map((a) => ({ activityId: a.activityId, title: a.title, enrolled: a.enrolled, capacity: a.capacity })),
  };
}

export async function mockComparison(): Promise<ActivityComparisonRow[]> {
  await delay();
  const db = load();
  return db.activities
    .filter((a) => !a.deletedAt)
    .map((a) => {
      const regs = db.registrations.filter((r) => r.activityId === a.activityId);
      const approved = regs.filter((r) => r.status === 'APPROVED').length;
      const checkedIn = db.checkins.filter((c) => c.activityId === a.activityId).length;
      return {
        activityId: a.activityId,
        title: a.title,
        category: a.category,
        capacity: a.capacity,
        enrolled: regs.length,
        approved,
        rejected: regs.filter((r) => r.status === 'REJECTED').length,
        waiting: regs.filter((r) => r.status === 'WAITING').length,
        cancelled: regs.filter((r) => r.status === 'CANCELLED').length,
        checkedIn,
        checkinRate: approved ? Math.round((checkedIn / approved) * 100) : 0,
        startTime: a.startTime,
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export async function mockExportStatistics(): Promise<ActivityComparisonRow[]> {
  return mockComparison();
}
