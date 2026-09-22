import { useMemo, useState } from 'react';
import {
  BarChartOutlined,
  DashboardOutlined,
  LogoutOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  ScheduleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { USE_MOCK, resetDb } from '../api';
import { useAuth } from '../auth/useAuth';
import { RoleTag } from './StatusTags';

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const { user, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems: MenuProps['items'] = useMemo(() => {
    const items: NonNullable<MenuProps['items']> = [{ key: '/dashboard', icon: <DashboardOutlined />, label: '首页概览' }];
    if (hasPermission('activity:manage')) {
      items.push({ key: '/activities', icon: <ScheduleOutlined />, label: '活动管理' });
    }
    if (hasPermission('registration:review')) {
      items.push({ key: '/registrations', icon: <TeamOutlined />, label: '报名审核' });
    }
    if (hasPermission('checkin:manage')) {
      items.push({ key: '/checkin', icon: <QrcodeOutlined />, label: '签到管理' });
    }
    if (hasPermission('statistics:view')) {
      items.push({ key: '/statistics', icon: <BarChartOutlined />, label: '数据统计' });
    }
    return items;
  }, [hasPermission]);

  const activeKey = menuItems.map((i) => (i as { key: string }).key).find((key) => location.pathname.startsWith(key)) ?? '/dashboard';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" breakpoint="lg">
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 24 }}>🎟️</span>
          {!collapsed && <Typography.Text strong>ClubCue</Typography.Text>}
        </div>
        <Menu mode="inline" selectedKeys={[activeKey]} items={menuItems} onClick={({ key }) => navigate(key)} />
      </Sider>

      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {(menuItems.find(
              (i) => (i as { key: string }).key === activeKey
            ) as { label?: React.ReactNode } | undefined)?.label ?? 'ClubCue 管理端'}
          </Typography.Title>

          <Space size="middle">
            {USE_MOCK && (
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={() => {
                  resetDb();
                  window.location.reload();
                }}
              >
                重置演示数据
              </Button>
            )}
            {USE_MOCK && <Typography.Text type="secondary">演示模式</Typography.Text>}
            <Dropdown
              menu={{
                items: [
                  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
                ],
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ backgroundColor: '#1677ff' }} size="small">
                  {user?.name?.slice(0, 1)}
                </Avatar>
                <span>{user?.name}</span>
                <RoleTag role={user?.role ?? 'USER'} />
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: 16, padding: 24, background: '#fff', borderRadius: 8, minHeight: 'calc(100vh - 104px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
