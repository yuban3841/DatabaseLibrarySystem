import { useCallback, useEffect, useState } from 'react';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Input, Pagination, Progress, Select, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { ApiError, activityApi } from '../api';
import { ACTIVITY_STATUS_META, ActivityStatusTag } from '../components/StatusTags';
import type { Activity, ActivityCategory, ActivityStatus } from '../types';

const CATEGORIES: ActivityCategory[] = ['体育', '文艺', '学术', '志愿', '其他'];

export default function Activities() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<ActivityCategory | undefined>();
  const [status, setStatus] = useState<ActivityStatus | undefined>();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await activityApi.list({ page, pageSize, keyword, category, status });
      setRows(result.data);
      setTotal(result.page.total);
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '加载活动列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, category, status, message]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const runAction = async (label: string, actionId: string, task: () => Promise<unknown>) => {
    try {
      await task();
      message.success(`${label}成功`);
      void fetchList();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : `${label}失败`);
    }
  };

  const confirmOffline = (activity: Activity) => {
    modal.confirm({
      title: '确认下架活动',
      content: `下架「${activity.title}」后用户端不再展示、停止新报名；已有报名与签到记录仍然有效。`,
      okText: '下架',
      okButtonProps: { danger: true },
      onOk: () => runAction('下架', activity.activityId, () => activityApi.offline(activity.activityId)),
    });
  };

  const confirmDelete = (activity: Activity) => {
    modal.confirm({
      title: '确认逻辑删除活动',
      content: `删除「${activity.title}」后将从列表移除（数据保留，不做物理删除）。报名与签到记录不受影响。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: () => runAction('删除', activity.activityId, () => activityApi.remove(activity.activityId)),
    });
  };

  const columns: ColumnsType<Activity> = [
    {
      title: '活动',
      dataIndex: 'title',
      width: 300,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Space>
            <a onClick={() => navigate(`/activities/${record.activityId}/edit`)}>{record.title}</a>
            <ActivityStatusTag status={record.status} />
            {record.auditRequired && <Tag color="purple">审核制</Tag>}
          </Space>
          <span style={{ color: '#888', fontSize: 12 }}>{record.location}</span>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 90,
      render: (value: ActivityCategory) => <Tag>{value}</Tag>,
    },
    {
      title: '名额',
      width: 220,
      render: (_, record) => {
        const percent = record.capacity ? Math.min(100, Math.round((record.enrolled / record.capacity) * 100)) : 0;
        return (
          <Space direction="vertical" size="small">
            <Progress percent={percent} size="small" style={{ margin: 0, width: 160 }} />
            <span style={record.enrolled >= record.capacity ? { color: '#cf1322', fontSize: 12 } : { color: '#888', fontSize: 12 }}>
              {record.enrolled}/{record.capacity}
              {record.waiting > 0 && ` · 候补 ${record.waiting}`}
            </span>
          </Space>
        );
      },
    },
    {
      title: '报名截止',
      dataIndex: 'registerDeadline',
      width: 170,
      render: (value: string) => {
        const deadline = dayjs(value);
        const overdue = deadline.isBefore(dayjs());
        return <span style={overdue ? { color: '#cf1322' } : undefined}>{deadline.format('YYYY-MM-DD HH:mm')}</span>;
      },
    },
    { title: '创建人', dataIndex: 'creatorName', width: 100 },
    {
      title: '操作',
      width: 300,
      fixed: 'right',
      render: (_, record) => (
        <Space wrap size="small">
          <Button size="small" onClick={() => navigate(`/activities/${record.activityId}/edit`)}>
            编辑
          </Button>
          <Button size="small" onClick={() => navigate(`/registrations?activityId=${record.activityId}`)}>
            报名名单
          </Button>
          <Button size="small" onClick={() => navigate(`/checkin?activityId=${record.activityId}`)}>
            签到
          </Button>
          {(record.status === 'DRAFT' || record.status === 'OFFLINE') && (
            <Button
              type="primary"
              size="small"
              onClick={() => runAction('发布', record.activityId, () => activityApi.publish(record.activityId))}
            >
              发布
            </Button>
          )}
          {record.status === 'PUBLISHED' && (
            <Button danger size="small" onClick={() => confirmOffline(record)}>
              下架
            </Button>
          )}
          <Tooltip title="生成草稿副本，不复制报名数据">
            <Button
              size="small"
              onClick={() => runAction('复制', record.activityId, () => activityApi.copy(record.activityId))}
            >
              复制
            </Button>
          </Tooltip>
          <Tooltip title={record.status === 'ARCHIVED' ? '已归档活动不可删除' : '逻辑删除'}>
            <Button danger size="small" disabled={record.status === 'ARCHIVED'} onClick={() => confirmDelete(record)}>
              删除
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="cc-toolbar">
        <Input.Search
          placeholder="搜索标题 / 地点"
          allowClear
          onSearch={(value) => {
            setKeyword(value);
            setPage(1);
          }}
          style={{ width: 240 }}
        />
        <Select
          placeholder="活动分类"
          allowClear
          options={CATEGORIES.map((value) => ({ value, label: value }))}
          onChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
          style={{ width: 130 }}
        />
        <Select
          placeholder="活动状态"
          allowClear
          options={Object.entries(ACTIVITY_STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
          onChange={(value) => {
            setStatus(value as ActivityStatus | undefined);
            setPage(1);
          }}
          style={{ width: 130 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void fetchList()}>
          刷新
        </Button>
        <span className="spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/activities/new')}>
          新建活动
        </Button>
      </div>

      <Table
        rowKey="activityId"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        scroll={{ x: 1200 }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showTotal={(count) => `共 ${count} 个活动`}
          onChange={(nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          }}
        />
      </div>
    </div>
  );
}
