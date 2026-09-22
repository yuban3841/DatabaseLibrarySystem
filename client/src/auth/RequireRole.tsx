/**
 * 路由守卫：未登录跳登录页，角色不足显示 403。
 * 管理端允许 ADMIN / ORGANIZER 进入；USER（社团成员）被拒绝。
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Result, Spin } from 'antd';
import type { Role } from '../types';
import { useAuth } from './useAuth';

interface RequireRoleProps {
  children: ReactNode;
  roles?: Role[];
}

export default function RequireRole({ children, roles = ['ADMIN', 'ORGANIZER'] }: RequireRoleProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="正在校验登录态…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return (
      <Result
        status="403"
        title="无权访问"
        subTitle={`您不是管理端账号（当前角色：${user.role ?? '未知'}），请返回用户端。`}
      />
    );
  }

  return <>{children}</>;
}
