import {
    DimensionType,
    Explore,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
} from '@lightdash/common';

export const EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES: Explore = {
    name: 'payments',
    tags: [],
    label: 'Payments',
    baseTable: 'payments',
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    joinedTables: [
        {
            sqlOn: '${orders.order_id} = ${payments.order_id}',
            table: 'orders',
            compiledSqlOn: '("orders".order_id) = ("payments".order_id)',
            type: undefined,
        },
    ],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            schema: 'jaffle',
            database: 'postgres',
            sqlTable: '"postgres"."jaffle"."orders"',
            lineageGraph: {
                orders: [
                    { name: 'stg_orders', type: 'model' },
                    { name: 'stg_payments', type: 'model' },
                ],
                stg_orders: [],
                stg_payments: [],
            },
            metrics: {
                average_order_size: {
                    sql: '${TABLE}.amount',
                    name: 'average_order_size',
                    type: MetricType.AVERAGE,
                    label: 'Average order size',
                    table: 'orders',
                    hidden: false,
                    fieldType: FieldType.METRIC,
                    tableLabel: 'Orders',
                    compiledSql: 'AVG("orders".amount)',
                    description: 'Average of Amount',
                    tablesReferences: ['orders'],
                },
            },
            dimensions: {
                amount: {
                    sql: '${TABLE}.amount',
                    name: 'amount',
                    type: DimensionType.NUMBER,
                    index: 5,
                    label: 'Amount',
                    table: 'orders',
                    hidden: true,
                    fieldType: FieldType.DIMENSION,
                    tableLabel: 'Orders',
                    compiledSql: '"orders".amount',
                    description: 'Total amount (USD) of the order',
                    tablesReferences: ['orders'],
                },
            },
        },
        payments: {
            name: 'payments',
            label: 'Payments',
            schema: 'jaffle',
            database: 'postgres',
            sqlTable: '"postgres"."jaffle"."payments"',
            lineageGraph: {
                payments: [{ name: 'stg_payments', type: 'model' }],
                stg_payments: [],
            },
            metrics: {
                total_revenue: {
                    sql: '${TABLE}.amount',
                    name: 'total_revenue',
                    type: MetricType.SUM,
                    label: 'Total revenue',
                    table: 'payments',
                    hidden: false,
                    fieldType: FieldType.METRIC,
                    tableLabel: 'Payments',
                    compiledSql: 'SUM("payments".amount)',
                    tablesReferences: ['payments'],
                },
                metric_amount_diff: {
                    sql: '${orders.amount} - ${TABLE}.amount',
                    name: 'metric_amount_diff',
                    type: MetricType.NUMBER,
                    label: 'metric_amount_diff',
                    table: 'payments',
                    hidden: false,
                    fieldType: FieldType.METRIC,
                    tableLabel: 'Payments',
                    compiledSql: '"orders".amount - "payments".amount',
                    tablesReferences: ['payments', 'orders'],
                },
            },
            dimensions: {
                amount: {
                    sql: '${TABLE}.amount',
                    name: 'amount',
                    type: DimensionType.NUMBER,
                    index: 3,
                    label: 'Amount',
                    table: 'payments',
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    tableLabel: 'Payments',
                    compiledSql: '"payments".amount',
                    tablesReferences: ['payments'],
                },
                dim_amount_diff: {
                    sql: '${orders.amount} - ${TABLE}.amount',
                    name: 'dim_amount_diff',
                    type: DimensionType.NUMBER,
                    label: 'dim_amount_diff',
                    table: 'payments',
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    tableLabel: 'Payments',
                    compiledSql: '"orders".amount - "payments".amount',
                    tablesReferences: ['payments', 'orders'],
                },
                name: {
                    sql: '${TABLE}.name',
                    name: 'name',
                    type: DimensionType.STRING,
                    label: 'Name',
                    table: 'payments',
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    tableLabel: 'Payments',
                    compiledSql: '"payments".name',
                    tablesReferences: ['payments'],
                },
            },
        },
    },
};

export const EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES: Explore = {
    ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
    tables: {
        orders: {
            ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables.orders!,
            requiredAttributes: {
                access_level: '1',
            },
        },
        payments: {
            ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables.payments!,
            requiredAttributes: {
                access_level: '2',
            },
        },
    },
    unfilteredTables: {
        ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables,
    },
};

export const EXPLORE_WITH_DIMENSION_REQUIRED_ATTRIBUTES: Explore = {
    ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES,
    tables: {
        orders: {
            ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables.orders!,
        },
        payments: {
            ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables.payments!,
            dimensions: {
                ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables.payments!
                    .dimensions,
                name: {
                    ...EXPLORE_WITH_NO_REQUIRED_ATTRIBUTES.tables.payments!
                        .dimensions.name!,
                    requiredAttributes: {
                        access_level: '3',
                    },
                },
            },
        },
    },
};

export const EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES: Explore = {
    ...EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES,
    tables: {
        orders: {
            ...EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.tables.orders!,
        },
        payments: {
            ...EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.tables.payments!,
            dimensions: {
                ...EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.tables.payments!
                    .dimensions,
                name: {
                    ...EXPLORE_WITH_TABLE_REQUIRED_ATTRIBUTES.tables.payments!
                        .dimensions.name!,
                    requiredAttributes: {
                        access_level: '3',
                    },
                },
            },
        },
    },
};

export const EXPLORE_FILTERED_WITH_ACCESS_LEVEL_2: Explore = {
    ...EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
    joinedTables: [],
    tables: {
        payments: {
            ...EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES.tables
                .payments!,
            metrics: {
                total_revenue:
                    EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES.tables
                        .payments!.metrics.total_revenue!,
            },
            dimensions: {
                amount: EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES
                    .tables.payments!.dimensions.amount!,
            },
        },
    },
    unfilteredTables: {
        ...EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES.tables,
    },
};

export const EXPLORE_FILTERED_WITH_ACCESS_LEVEL_1_2: Explore = {
    ...EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
    tables: {
        orders: EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES.tables
            .orders!,
        payments: {
            ...EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES.tables
                .payments!,
            dimensions: {
                amount: EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES
                    .tables.payments!.dimensions.amount!,
                dim_amount_diff:
                    EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES.tables
                        .payments!.dimensions.dim_amount_diff!,
            },
        },
    },
    unfilteredTables: {
        ...EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES.tables,
    },
};

export const EXPLORE_FILTERED_WITH_ACCESS_LEVEL_1_2_3: Explore = {
    ...EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES,
    unfilteredTables: {
        ...EXPLORE_WITH_TABLE_AND_DIMENSION_REQUIRED_ATTRIBUTES.tables,
    },
};
