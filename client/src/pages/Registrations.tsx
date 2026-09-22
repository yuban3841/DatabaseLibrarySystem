import { useCallback, useEffect, useState } from 'react';
import type { Key } from 'react';
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Drawer, Input, Modal, Pagination, Select, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { ApiError, activityApi, registrationApi } from '../api';
import { REGISTRATION_STATUS_META, RegistrationStatusTag } from '../components/StatusTags';
import type { Activity, Registration, RegistrationStatus } from '../types';
import { exportExcelTable } from '../utils/download';

const SORT_OPTIONS = [
  { value: 'createdAt', label: '按报名时间' },
  { value: 'waitingNo', label: '按候补序号' },
];

export default function Registrations() {
  const { message, modal } = App.useApp();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState<string | undefined>();
  const [activityTitle, setActivityTitle] = useState('');

  const [rows, setRows] = useState<Registration[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusTab, setStatusTab] = useState<string>('ALL');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<'createdAt' | 'waitingNo'>('createdAt');
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

  const [rejectModal, setRejectModal] = useState<{ ids: string[]; label: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [detail, setDetail] = useState<Registration | null>(null);

  // 加载可用于审核的活动（排除草稿与归档之外的活动也纳入，便于查看历史）
  useEffect(() => {
    void (async () => {
      const result = await activityApi.list({ page: 1, pageSize: 200 });
      const list = result.data.filter((a) => a.status !== 'DRAFT');
      setActivities(list);
      if (!activityId && list.length) {
        setActivityId(list[0].activityId);
        setActivityTitle(list[0].title);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildParams = useCallback(
    (override?: Partial<{ page: number; pageSize: number }>) => ({
      page: override?.page ?? page,
      pageSize: override?.pageSize ?? pageSize,
      status: statusTab === 'ALL' ? undefined : (statusTab as RegistrationStatus),
      keyword,
      sort,
      order: sort === 'waitingNo' ? ('ASC' as const) : ('DESC' as const),
    }),
    [page, pageSize, statusTab, keyword, sort]
  );

  const fetchList = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    try {
      const result = await registrationApi.list(activityId, buildParams());
      setRows(result.data);
      setTotal(result.page.total);
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '加载报名名单失败');
    } finally {
      setLoading(false);
    }
  }, [activityId, buildParams, message]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    setSelectedKeys([]);
  }, [activityId, statusTab, page]);

  const review = async (ids: string[], action: 'APPROVE' | 'REJECT', reason?: string) => {
    try {
      if (ids.length === 1) {
        await registrationApi.review(ids[0], { action, reason });
      } else {
        const result = await registrationApi.batchReview({ registrationIds: ids, action, reason });
        if (result.skipped > 0) {
          message.warning(`成功 ${result.succeeded} 条，跳过 ${result.skipped} 条（已取消或状态冲突）`);
          return;
        }
      }
      message.success(action === 'APPROVE' ? '已通过' : '已驳回');
      void fetchList();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '审核失败');
    }
  };

  const openReject = (ids: string[], label: string) => {
    if (!ids.length) {
      message.warning('请先选择要驳回的报名');
      return;
    }
    setRejectReason('');
    setRejectModal({ ids, label });
  };

  const confirmReject = async () => {
    if (!rejectModal) return;
    if (!rejectReason.trim()) {
      message.warning('请填写驳回理由');
      return;
    }
    setRejecting(true);
    try {
      await review(rejectModal.ids, 'REJECT', rejectReason.trim());
      setRejectModal(null);
    } finally {
      setRejecting(false);
    }
  };

  const promote = async (id: string) => {
    try {
      await registrationApi.promote(id);
      message.success('候补已转正并生成电子票');
      void fetchList();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '递补失败');
    }
  };

  const handleExport = async () => {
    if (!activityId) return;
    try {
      const all = await registrationApi.exportRows(activityId, buildParams({ page: 1, pageSize: 100000 }));
      const stamp = dayjs().format('YYYYMMDDHHmmss');
      exportExcelTable(
        `${activityTitle || activityId}_报名名单_${stamp}`,
        ['学号', '姓名', '学院', '状态', '候补序号', '报名时间', '审核时间', '审核人', '电子票码', '驳回理由'],
        all.map((r) => [
          r.studentId,
          r.name,
          r.college ?? '',
          REGISTRATION_STATUS_META[r.status].label,
          r.waitingNo ?? '',
          r.createdAt,
          r.reviewedAt ?? '',
          r.reviewerName ?? '',
          r.ticketCode ?? '',
          r.rejectReason ?? '',
        ])
      );
      message.success(`已导出 ${all.length} 条报名记录`);
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '导出失败');
    }
  };

  const handleDownloadTemplate = () => {
    modal.info({
      title: '关于批量审核',
      content: (
        <div>
          <p>勾选表格左侧复选框后，点击「批量通过」或「批量驳回」。</p>
          <p>批量驳回必须填写理由；状态冲突的记录会被跳过并在结果里提示。</p>
        </div>
      ),
    });
  };

  const columns: ColumnsType<Registration> = [
    { title: '学号', dataIndex: 'studentId', width: 110, fixed: 'left' },
    { title: '姓名', dataIndex: 'name', width: 100, fixed: 'left' },
    { title: '学院', dataIndex: 'college', width: 150, ellipsis: true, render: (value) => value ?? '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: RegistrationStatus) => <RegistrationStatusTag status={value} />,
    },
    {
      title: '候补序号',
      dataIndex: 'waitingNo',
      width: 90,
      align: 'center',
      render: (value: number | null) => (value == null ? '-' : <Tag color="blue">#{value}</Tag>),
    },
    { title: '报名时间', dataIndex: 'createdAt', width: 160 },
    {
      title: '审核信息',
      width: 190,
      render: (_, record) =>
        record.reviewedAt ? (
          <Space direction="vertical" size="small">
            <span>{dayjs(record.reviewedAt).format('YYYY-MM-DD HH:mm')}</span>
            {record.reviewerName ? <span style={{ color: '#888', fontSize: 12 }}>审核人：{record.reviewerName}</span> : null}
          </Space>
        ) : (
          <span style={{ color: '#bbb' }}>—</span>
        ),
    },
    {
      title: '电子票码',
      dataIndex: 'ticketCode',
      width: 170,
      render: (value: string | null) =>
        value ? (
          <Tooltip title={value}>
            <code style={{ fontSize: 12 }}>{value.length > 18 ? `${value.slice(0, 18)}…` : value}</code>
          </Tooltip>
        ) : (
          <span style={{ color: '#bbb' }}>—</span>
        ),
    },
    {
      title: '驳回理由',
      dataIndex: 'rejectReason',
      width: 180,
      ellipsis: true,
      render: (value) => (value ? <span style={{ color: '#cf1322' }}>{value}</span> : '-'),
    },
    {
      title: '操作',
      width: 210,
      fixed: 'right',
      render: (_, record) => (
        <Space wrap size="small">
          <Button size="small" type="link" onClick={() => setDetail(record)}>
            详情
          </Button>
          {(record.status === 'PENDING' || record.status === 'WAITING') && (
            <Button size="small" type="primary" onClick={() => void review([record.registrationId], 'APPROVE')}>
              {record.status === 'WAITING' ? '递补' : '通过'}
            </Button>
          )}
          {record.status === 'APPROVED' && (
            <Button size="small" danger onClick={() => openReject([record.registrationId], '驳回')}>
              驳回
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="cc-toolbar">
        <Space wrap>
          <span>活动：</span>
          <Select
            value={activityId}
            style={{ width: 300 }}
            options={activities.map((a) => ({
              value: a.activityId,
              label: `${a.title}（${a.enrolled}/${a.capacity}）`,
            }))}
            onChange={(value) => {
              setActivityId(value);
              const found = activities.find((a) => a.activityId === value);
              setActivityTitle(found?.title ?? '');
              setPage(1);
            }}
          />
        </Space>
        <span className="spacer" />
        <Button icon={<DownloadOutlined />} onClick={() => void handleExport()}>
          导出 Excel
        </Button>
        <Button onClick={handleDownloadTemplate}>审核说明</Button>
      </div>

      <Tabs
        activeKey={statusTab}
        onChange={(key) => {
          setStatusTab(key);
          setPage(1);
        }}
        items={[
          { key: 'ALL', label: '全部' },
          { key: 'PENDING', label: '待审核' },
          { key: 'APPROVED', label: '已通过' },
          { key: 'WAITING', label: '候补' },
          { key: 'REJECTED', label: '已驳回' },
          { key: 'CANCELLED', label: '已取消' },
        ]}
        style={{ marginBottom: 8 }}
      />

      <div className="cc-toolbar">
        <Input.Search
          placeholder="学号 / 姓名"
          allowClear
          onSearch={(value) => {
            setKeyword(value);
            setPage(1);
          }}
          style={{ width: 220 }}
        />
        <Select
          value={sort}
          options={SORT_OPTIONS}
          onChange={(value) => {
            setSort(value);
            setPage(1);
          }}
          style={{ width: 150 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void fetchList()}>
          刷新
        </Button>
        <span className="spacer" />
        <Button
          type="primary"
          disabled={!selectedKeys.length}
          onClick={() => void review(selectedKeys.map(String), 'APPROVE')}
        >
          批量通过{selectedKeys.length ? `（${selectedKeys.length}）` : ''}
        </Button>
        <Button danger disabled={!selectedKeys.length} onClick={() => openReject(selectedKeys.map(String), '批量驳回')}>
          批量驳回{selectedKeys.length ? `（${selectedKeys.length}）` : ''}
        </Button>
      </div>

      <Table
        rowKey="registrationId"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        scroll={{ x: 1300 }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          preserveSelectedRowKeys: true,
          onChange: (keys) => setSelectedKeys(keys),
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }} className="cc-toolbar">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showTotal={(count) => `共 ${count} 条报名`}
          onChange={(nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          }}
        />
      </div>

      <Modal
        title={`驳回 ${rejectModal?.ids.length ?? 0} 条报名`}
        open={!!rejectModal}
        okText="确认驳回"
        okButtonProps={{ danger: true, loading: rejecting }}
        cancelText="取消"
        onOk={() => void confirmReject()}
        onCancel={() => setRejectModal(null)}
      >
        <p style={{ color: '#888' }}>驳回后将释放名额并自动尝试候补转正，理由会同步到申请人。</p>
        <Input.TextArea
          rows={4}
          maxLength={200}
          showCount
          placeholder="请输入驳回理由（必填）"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>

      <Drawer
        title="报名详情"
        width={460}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 12, margin: 0 }}>
            <dt style={{ color: '#888' }}>报名记录ID</dt>
            <dd style={{ margin: 0 }}>{detail.registrationId}</dd>
            <dt style={{ color: '#888' }}>学号</dt>
            <dd style={{ margin: 0 }}>{detail.studentId}</dd>
            <dt style={{ color: '#888' }}>姓名</dt>
            <dd style={{ margin: 0 }}>{detail.name}</dd>
            <dt style={{ color: '#888' }}>学院</dt>
            <dd style={{ margin: 0 }}>{detail.college ?? '-'}</dd>
            <dt style={{ color: '#888' }}>状态</dt>
            <dd style={{ margin: 0 }}>
              <RegistrationStatusTag status={detail.status} />
            </dd>
            <dt style={{ color: '#888' }}>候补序号</dt>
            <dd style={{ margin: 0 }}>{detail.waitingNo ?? '-'}</dd>
            <dt style={{ color: '#888' }}>报名时间</dt>
            <dd style={{ margin: 0 }}>{detail.createdAt}</dd>
            <dt style={{ color: '#888' }}>审核时间</dt>
            <dd style={{ margin: 0 }}>{detail.reviewedAt ?? '-'}</dd>
            <dt style={{ color: '#888' }}>审核人</dt>
            <dd style={{ margin: 0 }}>{detail.reviewerName ?? '-'}</dd>
            <dt style={{ color: '#888' }}>电子票码</dt>
            <dd style={{ margin: 0 }}>
              {detail.ticketCode ? <code>{detail.ticketCode}</code> : '-'}
            </dd>
            <dt style={{ color: '#888' }}>驳回理由</dt>
            <dd style={{ margin: 0, color: detail.rejectReason ? '#cf1322' : undefined }}>{detail.rejectReason ?? '-'}</dd>
          </dl>
        )}
      </Drawer>
    </div>
  );
}
