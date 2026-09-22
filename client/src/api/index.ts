/**
 * ClubCue 管理端 — 领域 API
 *
 * 每个函数都走 USE_MOCK 分支：
 *   true  → 内置演示数据（src/api/mock.ts），后端未就绪时可独立运行
 *   false → 真实后端 /api/v1
 * 切换只改 .env，页面代码不需要动。
 */
import http, { USE_MOCK, unwrap } from './http';
import * as mock from './mock';
import type {
  Activity,
  ActivityCategory,
  ActivityComparisonRow,
  ActivityFormPayload,
  ActivityListParams,
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
  ReviewPayload,
  ScanCheckinPayload,
  User,
} from '../types';

export { ApiError, USE_MOCK, downloadBlob } from './http';
export { resetDb } from './mock';

// ---------------- 认证 ----------------

export const authApi = {
  login: async (payload: LoginPayload): Promise<LoginResult> =>
    USE_MOCK ? mock.mockLogin(payload) : unwrap(http.post('/auth/login', payload)),
  me: async (): Promise<User> => (USE_MOCK ? mock.mockMe() : unwrap(http.get('/auth/me'))),
  logout: async (): Promise<void> => {
    if (!USE_MOCK) await http.post('/auth/logout');
    localStorage.removeItem('clubcue_token');
    localStorage.removeItem('clubcue_user');
    await mock.mockLogout();
  },
};

// ---------------- 活动 ----------------

export const activityApi = {
  categories: async (): Promise<ActivityCategory[]> =>
    USE_MOCK ? mock.CATEGORIES : unwrap(http.get('/activity-categories')),

  list: async (params: ActivityListParams): Promise<Paged<Activity>> =>
    USE_MOCK ? mock.mockListActivities(params) : unwrap(http.get('/activities', { params })),

  detail: async (activityId: string): Promise<Activity> =>
    USE_MOCK ? mock.mockGetActivity(activityId) : unwrap(http.get(`/activities/${activityId}`)),

  create: async (payload: ActivityFormPayload): Promise<Activity> =>
    USE_MOCK ? mock.mockCreateActivity(payload) : unwrap(http.post('/activities', payload)),

  update: async (activityId: string, payload: ActivityFormPayload): Promise<Activity> =>
    USE_MOCK ? mock.mockUpdateActivity(activityId, payload) : unwrap(http.put(`/activities/${activityId}`, payload)),

  publish: async (activityId: string): Promise<Activity> =>
    USE_MOCK ? mock.mockPublishActivity(activityId) : unwrap(http.post(`/activities/${activityId}/publish`)),

  offline: async (activityId: string): Promise<Activity> =>
    USE_MOCK ? mock.mockOfflineActivity(activityId) : unwrap(http.post(`/activities/${activityId}/offline`)),

  copy: async (activityId: string): Promise<Activity> =>
    USE_MOCK ? mock.mockCopyActivity(activityId) : unwrap(http.post(`/activities/${activityId}/copy`)),

  remove: async (activityId: string): Promise<void> => {
    if (!USE_MOCK) await http.delete(`/activities/${activityId}`);
    else await mock.mockRemoveActivity(activityId);
  },
};

// ---------------- 报名 ----------------

export const registrationApi = {
  list: async (activityId: string, params: RegistrationListParams): Promise<Paged<Registration>> =>
    USE_MOCK
      ? mock.mockListRegistrations(activityId, params)
      : unwrap(http.get(`/activities/${activityId}/registrations`, { params })),

  review: async (registrationId: string, payload: ReviewPayload): Promise<Registration> =>
    USE_MOCK ? mock.mockReviewRegistration(registrationId, payload) : unwrap(http.patch(`/registrations/${registrationId}/review`, payload)),

  batchReview: async (
    payload: BatchReviewPayload
  ): Promise<{ succeeded: number; skipped: number }> =>
    USE_MOCK ? mock.mockBatchReview(payload) : unwrap(http.post('/registrations/batch-review', payload)),

  promote: async (registrationId: string): Promise<Registration> =>
    USE_MOCK ? mock.mockPromoteRegistration(registrationId) : unwrap(http.post(`/registrations/${registrationId}/promote`)),

  /** 导出用：全量拉取当前筛选条件，再由前端转 Excel */
  exportRows: async (activityId: string, params: RegistrationListParams): Promise<Registration[]> =>
    USE_MOCK
      ? mock.mockExportRegistrations(activityId, params)
      : unwrap(http.get(`/activities/${activityId}/registrations`, { params: { ...params, page: 1, pageSize: 100000 } })),
};

// ---------------- 签到 ----------------

export const checkinApi = {
  issueCode: async (activityId: string): Promise<CheckinCodeResult> =>
    USE_MOCK ? mock.mockIssueCheckinCode(activityId) : unwrap(http.get(`/activities/${activityId}/checkin-code`)),

  scan: async (payload: ScanCheckinPayload): Promise<CheckinRecord> =>
    USE_MOCK ? mock.mockScanCheckin(payload) : unwrap(http.post('/checkins', payload)),

  manual: async (payload: ManualCheckinPayload): Promise<CheckinRecord> =>
    USE_MOCK ? mock.mockManualCheckin(payload) : unwrap(http.post('/checkins/manual', payload)),

  list: async (
    activityId: string,
    params: { page?: number; pageSize?: number }
  ): Promise<Paged<CheckinRecord>> =>
    USE_MOCK ? mock.mockListCheckins(activityId, params) : unwrap(http.get(`/activities/${activityId}/checkins`, { params })),

  board: async (activityId: string): Promise<CheckinBoardResult> =>
    USE_MOCK ? mock.mockCheckinBoard(activityId) : unwrap(http.get(`/activities/${activityId}/checkin-board`)),
};

// ---------------- 统计 ----------------

export const statisticsApi = {
  dashboard: async (): Promise<DashboardStats> =>
    USE_MOCK ? mock.mockDashboard() : unwrap(http.get('/statistics/dashboard')),

  comparison: async (): Promise<ActivityComparisonRow[]> =>
    USE_MOCK ? mock.mockComparison() : unwrap(http.get('/statistics/activity-comparison')),

  exportRows: async (): Promise<ActivityComparisonRow[]> =>
    USE_MOCK ? mock.mockExportStatistics() : unwrap(http.get('/statistics/activity-comparison')),
};
