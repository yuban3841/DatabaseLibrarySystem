/**
 * ClubCue 管理端 — 领域类型定义
 *
 * 字段命名与项目计划《接口契约》保持一致（camelCase），
 * 时间统一 "YYYY-MM-DD HH:mm:ss"（Asia/Shanghai）。
 */

// ---------------- 角色与用户 ----------------

export type Role = 'ADMIN' | 'ORGANIZER' | 'USER';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface User {
  userId: string;
  studentId: string;
  name: string;
  college?: string;
  role: Role;
  status: UserStatus;
  avatar?: string;
  permissions: string[];
  createdAt: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  /** access token 有效期（秒） */
  expiresIn: number;
  refreshToken?: string;
  user: User;
}

// ---------------- 活动 ----------------

export type ActivityCategory = '体育' | '文艺' | '学术' | '志愿' | '其他';
export type ActivityStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | 'ARCHIVED';

export interface Activity {
  activityId: string;
  title: string;
  description: string;
  cover: string;
  category: ActivityCategory;
  /** 名额上限 */
  capacity: number;
  /** 名额内已批准人数 */
  enrolled: number;
  /** 候补队列人数 */
  waiting: number;
  /** 是否审核制报名 */
  auditRequired: boolean;
  startTime: string;
  endTime: string;
  registerDeadline: string;
  location: string;
  latitude?: number;
  longitude?: number;
  status: ActivityStatus;
  /** 逻辑删除标记，非空表示已删除（后端不物理删除，保留关联报名与签到数据） */
  deletedAt?: string;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: ActivityCategory;
  /** 管理端默认可看全部状态；不传即全部 */
  status?: ActivityStatus;
}

export type ActivityFormPayload = Omit<
  Activity,
  'activityId' | 'enrolled' | 'waiting' | 'status' | 'creatorId' | 'creatorName' | 'createdAt' | 'updatedAt'
>;

// ---------------- 报名 ----------------

export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'WAITING' | 'REJECTED' | 'CANCELLED';

export interface Registration {
  registrationId: string;
  activityId: string;
  userId: string;
  studentId: string;
  name: string;
  college?: string;
  status: RegistrationStatus;
  /** 候补序号，非候补为 null */
  waitingNo: number | null;
  /** 电子票票码，审批通过后生成 */
  ticketCode: string | null;
  rejectReason?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewerName?: string;
}

export interface RegistrationListParams {
  page?: number;
  pageSize?: number;
  status?: RegistrationStatus;
  /** 学号 / 姓名模糊匹配 */
  keyword?: string;
  sort?: 'createdAt' | 'waitingNo';
  order?: 'ASC' | 'DESC';
}

export type ReviewAction = 'APPROVE' | 'REJECT';

export interface ReviewPayload {
  action: ReviewAction;
  /** 驳回必填 */
  reason?: string;
}

export interface BatchReviewPayload {
  registrationIds: string[];
  action: ReviewAction;
  reason?: string;
}

// ---------------- 签到 ----------------

export type CheckinMethod = 'SCAN' | 'MANUAL' | 'GEO';

export interface CheckinRecord {
  checkinId: string;
  activityId: string;
  registrationId: string;
  userId: string;
  name: string;
  studentId: string;
  method: CheckinMethod;
  checkinTime: string;
  operatorName?: string;
}

export interface CheckinCodeResult {
  /** 二维码载荷（含有效期，签到端需校验） */
  payload: string;
  /** 有效期（秒） */
  expiresInSeconds: number;
  checkinWindow: string;
}

export interface ScanCheckinPayload {
  activityId: string;
  ticketCode: string;
  /** 现场定位（可选加分项） */
  latitude?: number;
  longitude?: number;
}

export interface ManualCheckinPayload {
  activityId: string;
  userId: string;
  operatorName: string;
  remark?: string;
}

export interface CheckinBoardResult {
  activityId: string;
  activityTitle: string;
  capacity: number;
  approved: number;
  checkedIn: number;
  checkinRate: number;
  latest: CheckinRecord[];
}

// ---------------- 统计 ----------------

export interface DashboardStats {
  activityCount: number;
  publishedCount: number;
  totalRegistration: number;
  pendingReview: number;
  todayCheckin: number;
  avgCheckinRate: number;
  /** 近 7 天报名趋势 */
  registrationTrend: { date: string; count: number }[];
  categoryDistribution: { category: ActivityCategory; count: number }[];
  hotActivities: { activityId: string; title: string; enrolled: number; capacity: number }[];
}

export interface ActivityComparisonRow {
  activityId: string;
  title: string;
  category: ActivityCategory;
  capacity: number;
  enrolled: number;
  approved: number;
  rejected: number;
  waiting: number;
  cancelled: number;
  checkedIn: number;
  checkinRate: number;
  startTime: string;
}

// ---------------- 通用 ----------------

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  page: PageInfo;
}

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  page?: PageInfo;
}
