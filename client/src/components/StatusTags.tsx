import { Tag } from 'antd';
import type { ActivityStatus, CheckinMethod, RegistrationStatus, Role } from '../types';

export const ACTIVITY_STATUS_META: Record<ActivityStatus, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  PUBLISHED: { label: '已发布', color: 'green' },
  OFFLINE: { label: '已下架', color: 'orange' },
  ARCHIVED: { label: '已归档', color: 'purple' },
};

export const REGISTRATION_STATUS_META: Record<RegistrationStatus, { label: string; color: string }> = {
  PENDING: { label: '待审核', color: 'gold' },
  APPROVED: { label: '已通过', color: 'green' },
  WAITING: { label: '候补', color: 'blue' },
  REJECTED: { label: '已驳回', color: 'red' },
  CANCELLED: { label: '已取消', color: 'default' },
};

export const CHECKIN_METHOD_META: Record<CheckinMethod, { label: string; color: string }> = {
  SCAN: { label: '扫码签到', color: 'green' },
  MANUAL: { label: '手动补签', color: 'orange' },
  GEO: { label: '定位签到', color: 'cyan' },
};

export const ROLE_META: Record<Role, { label: string; color: string }> = {
  ADMIN: { label: '系统管理员', color: 'red' },
  ORGANIZER: { label: '组织人', color: 'geekblue' },
  USER: { label: '社团成员', color: 'blue' },
};

export function ActivityStatusTag({ status }: { status: ActivityStatus }) {
  const meta = ACTIVITY_STATUS_META[status];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function RegistrationStatusTag({ status }: { status: RegistrationStatus }) {
  const meta = REGISTRATION_STATUS_META[status];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function CheckinMethodTag({ method }: { method: CheckinMethod }) {
  const meta = CHECKIN_METHOD_META[method];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function RoleTag({ role }: { role: Role }) {
  const meta = ROLE_META[role];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}
