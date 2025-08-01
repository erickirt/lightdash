import { merge } from 'lodash';
import {
    SupportedDbtAdapter,
    buildModelGraph,
    convertColumnMetric,
    convertModelMetric,
    convertToAiHints,
    convertToGroups,
    isV9MetricRef,
    type DbtColumnLightdashDimension,
    type DbtColumnMetadata,
    type DbtMetric,
    type DbtModelColumn,
    type DbtModelNode,
    type LineageGraph,
} from '../types/dbt';
import { MissingCatalogEntryError, ParseError } from '../types/errors';
import {
    InlineErrorType,
    type Explore,
    type ExploreError,
    type Table,
} from '../types/explore';
import {
    DimensionType,
    FieldType,
    MetricType,
    defaultSql,
    friendlyName,
    parseMetricType,
    type Dimension,
    type Metric,
    type Source,
} from '../types/field';
import {
    parseFilters,
    parseModelRequiredFilters,
} from '../types/filterGrammar';
import { type LightdashProjectConfig } from '../types/lightdashProjectConfig';
import { OrderFieldsByStrategy, type GroupType } from '../types/table';
import { type TimeFrames } from '../types/timeFrames';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import assertUnreachable from '../utils/assertUnreachable';
import {
    getDefaultTimeFrames,
    timeFrameConfigs,
    validateTimeFrames,
    type WeekDay,
} from '../utils/timeFrames';
import { ExploreCompiler } from './exploreCompiler';
import {
    getCategoriesFromResource,
    getSpotlightConfigurationForResource,
} from './lightdashProjectConfig';

const convertTimezone = (
    timestampSql: string,
    default_source_tz: string,
    target_tz: string,
    adapterType: SupportedDbtAdapter,
) => {
    // todo: implement default_source_tz
    // todo: implement target_tz
    // todo: implement conversion for all adapters
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            // TIMESTAMPS: stored as utc. returns utc. convert from utc to target_tz
            //   DATETIME: no tz. assume default_source_tz. covert from default_source_tz to target_tz
            return timestampSql;
        case SupportedDbtAdapter.SNOWFLAKE:
            // TIMESTAMP_NTZ: no tz. assume default_source_tz. convert from default_source_tz to target_tz
            // TIMESTAMP_LTZ: stored in utc. returns in session tz. convert from session tz to target_tz
            // TIMESTAMP_TZ: stored with tz. returns with tz. convert from value tz to target_tz
            return `TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ${timestampSql}))`;
        case SupportedDbtAdapter.REDSHIFT:
            // TIMESTAMP WITH TIME ZONE: stored in utc. returns utc. convert from utc to target_tz
            // TIMESTAMP WITHOUT TIME ZONE: no tz. assume utc. convert from utc to target_tz
            return timestampSql;
        case SupportedDbtAdapter.POSTGRES:
            // TIMESTAMP WITH TIME ZONE: stored as utc. returns in session tz. convert from session tz to target tz
            // TIMESTAMP WITHOUT TIME ZONE: no tz. assume default_source_tz. convert from default_source_tz to target_tz
            return timestampSql;
        case SupportedDbtAdapter.DATABRICKS:
            return timestampSql;
        case SupportedDbtAdapter.TRINO:
            return timestampSql;
        default:
            return assertUnreachable(
                adapterType,
                new ParseError(`Cannot recognise warehouse ${adapterType}`),
            );
    }
};

const isInterval = (
    dimensionType: DimensionType,
    dimension?: DbtColumnMetadata['dimension'],
): boolean =>
    [DimensionType.DATE, DimensionType.TIMESTAMP].includes(dimensionType) &&
    dimension?.time_intervals !== false &&
    ((dimension?.time_intervals && dimension.time_intervals !== 'OFF') ||
        !dimension?.time_intervals);

const convertDimension = (
    index: number,
    targetWarehouse: SupportedDbtAdapter,
    model: Pick<DbtModelNode, 'name' | 'relation_name'>,
    tableLabel: string,
    column: DbtModelColumn,
    source?: Source,
    timeInterval?: TimeFrames,
    startOfWeek?: WeekDay | null,
    isAdditionalDimension?: boolean,
): Dimension => {
    // Config block takes priority, then meta block
    const meta = merge({}, column.meta, column.config?.meta);
    let type = meta.dimension?.type || column.data_type || DimensionType.STRING;
    if (!Object.values(DimensionType).includes(type)) {
        throw new MissingCatalogEntryError(
            `Could not recognise type "${type}" for dimension "${
                column.name
            }" in dbt model "${model.name}". Valid types are: ${Object.values(
                DimensionType,
            ).join(', ')}`,
            {},
        );
    }
    let name = meta.dimension?.name || column.name;
    let sql = meta.dimension?.sql || defaultSql(column.name);
    let label = meta.dimension?.label || friendlyName(name);
    if (type === DimensionType.TIMESTAMP) {
        sql = convertTimezone(sql, 'UTC', 'UTC', targetWarehouse);
    }
    const isIntervalBase =
        timeInterval === undefined && isInterval(type, meta.dimension);

    let timeIntervalBaseDimensionName: string | undefined;

    const groups: string[] = convertToGroups(
        meta.dimension?.groups,
        meta.dimension?.group_label,
    );

    if (timeInterval) {
        timeIntervalBaseDimensionName = name;
        sql = timeFrameConfigs[timeInterval].getSql(
            targetWarehouse,
            timeInterval,
            sql,
            type,
            startOfWeek,
        );
        name = `${column.name}_${timeInterval.toLowerCase()}`;
        label = `${label} ${timeFrameConfigs[timeInterval]
            .getLabel()
            .toLowerCase()}`;

        groups.push(
            meta.dimension?.label ??
                friendlyName(timeIntervalBaseDimensionName),
        );

        type = timeFrameConfigs[timeInterval].getDimensionType(type);
    }
    return {
        index,
        fieldType: FieldType.DIMENSION,
        name,
        label,
        sql,
        table: model.name,
        tableLabel,
        type,
        description: meta.dimension?.description || column.description,
        source,
        timeInterval,
        timeIntervalBaseDimensionName,
        hidden: !!meta.dimension?.hidden,
        format: meta.dimension?.format,
        round: meta.dimension?.round,
        compact: meta.dimension?.compact,
        requiredAttributes: meta.dimension?.required_attributes,
        colors: meta.dimension?.colors,
        ...(meta.dimension?.urls ? { urls: meta.dimension.urls } : {}),
        ...(isAdditionalDimension ? { isAdditionalDimension } : {}),
        groups,
        isIntervalBase,
        ...(meta.dimension && meta.dimension.tags
            ? {
                  tags: Array.isArray(meta.dimension.tags)
                      ? meta.dimension.tags
                      : [meta.dimension.tags],
              }
            : {}),
        ...(meta.dimension?.ai_hint
            ? { aiHint: convertToAiHints(meta.dimension.ai_hint) }
            : {}),
    };
};

const generateTableLineage = (
    model: DbtModelNode,
    depGraph: ReturnType<typeof buildModelGraph>,
): LineageGraph => {
    const modelFamilyIds = [
        ...depGraph.dependantsOf(model.unique_id),
        ...depGraph.dependenciesOf(model.unique_id),
        model.unique_id,
    ];
    return modelFamilyIds.reduce<LineageGraph>(
        (prev, nodeId) => ({
            ...prev,
            [depGraph.getNodeData(nodeId).name]: depGraph
                .directDependenciesOf(nodeId)
                .map((d) => depGraph.getNodeData(d)),
        }),
        {},
    );
};

/**
 * @deprecated This function uses the old dbt metrics format.
 */
const convertDbtMetricToLightdashMetric = (
    metric: DbtMetric,
    tableName: string,
    tableLabel: string,
    spotlightConfig: LightdashProjectConfig['spotlight'],
    modelCategories: string[] | undefined,
): Metric => {
    let sql: string;
    let type: MetricType;
    if (metric.calculation_method === 'derived') {
        type = MetricType.NUMBER;
        const referencedMetrics = new Set(
            (metric.metrics || []).map((m) => m[0]),
        );
        if (!metric.expression) {
            throw new ParseError(
                `dbt derived metric "${metric.name}" must have the expression field set`,
            );
        }
        sql = metric.expression;

        referencedMetrics.forEach((ref) => {
            const re = new RegExp(`\\b${ref}\\b`, 'g');
            // eslint-disable-next-line no-useless-escape
            sql = sql.replace(re, `\$\{${ref}\}`);
        });
    } else {
        try {
            type = parseMetricType(metric.calculation_method);
        } catch (e) {
            throw new ParseError(
                `Cannot parse metric '${metric.unique_id}: type ${metric.calculation_method} is not a valid Lightdash metric type`,
            );
        }
        sql = defaultSql(metric.name);
        if (metric.expression) {
            const isSingleColumnName = /^[a-zA-Z0-9_]+$/g.test(
                metric.expression,
            );
            if (isSingleColumnName) {
                sql = defaultSql(metric.expression);
            } else {
                sql = metric.expression;
            }
        }
    }
    if (metric.filters && metric.filters.length > 0) {
        const filterSql = metric.filters
            .map(
                (filter) =>
                    // eslint-disable-next-line no-useless-escape
                    `(\$\{TABLE\}.${filter.field} ${filter.operator} ${filter.value})`,
            )
            .join(' AND ');
        sql = `CASE WHEN ${filterSql} THEN ${sql} ELSE NULL END`;
    }
    const groups: string[] = convertToGroups(
        metric.meta?.groups,
        metric.meta?.group_label,
    );
    const spotlightVisibility = spotlightConfig.default_visibility;

    const spotlightCategories = getCategoriesFromResource(
        'metric',
        metric.name,
        spotlightConfig,
        Array.from(new Set([...(modelCategories || [])])),
    );

    return {
        fieldType: FieldType.METRIC,
        type,
        name: metric.name,
        label: metric.label || friendlyName(metric.name),
        table: tableName,
        tableLabel,
        sql,
        description: metric.description,
        source: undefined,
        hidden: !!metric.meta?.hidden,
        round: metric.meta?.round,
        compact: metric.meta?.compact,
        format: metric.meta?.format,
        groups,
        percentile: metric.meta?.percentile,
        showUnderlyingValues: metric.meta?.show_underlying_values,
        filters: parseFilters(metric.meta?.filters),
        ...(metric.meta?.urls ? { urls: metric.meta.urls } : {}),
        ...(metric.meta && metric.meta.tags
            ? {
                  tags: Array.isArray(metric.meta.tags)
                      ? metric.meta.tags
                      : [metric.meta.tags],
              }
            : {}),
        ...getSpotlightConfigurationForResource(
            spotlightVisibility,
            spotlightCategories,
        ),
    };
};

function normalizePrimaryKey(
    primaryKey: DbtModelNode['meta']['primary_key'],
): string[] | undefined {
    if (primaryKey) {
        return Array.isArray(primaryKey) ? primaryKey : [primaryKey];
    }
    return undefined;
}

export const convertTable = (
    adapterType: SupportedDbtAdapter,
    model: DbtModelNode,
    dbtMetrics: DbtMetric[],
    spotlightConfig: LightdashProjectConfig['spotlight'],
    startOfWeek?: WeekDay | null,
): Omit<Table, 'lineageGraph'> => {
    // Config block takes priority, then meta block
    const meta = merge({}, model.meta, model.config?.meta);
    const tableLabel = meta.label || friendlyName(model.name);

    const [dimensions, metrics]: [
        Record<string, Dimension>,
        Record<string, Metric>,
    ] = Object.values(model.columns).reduce(
        ([prevDimensions, prevMetrics], column, index) => {
            const dimension = convertDimension(
                index,
                adapterType,
                model,
                tableLabel,
                column,
                undefined,
                undefined,
                startOfWeek,
            );

            // Config block takes priority, then meta block
            const columnMeta = merge({}, column.meta, column.config?.meta);

            const processIntervalDimension = (
                dim: Dimension,
                overrideTimeIntervals: DbtColumnLightdashDimension['time_intervals'],
            ) => {
                if (dim.isIntervalBase) {
                    let intervals: TimeFrames[] = [];

                    if (
                        !dim.isAdditionalDimension &&
                        columnMeta.dimension?.time_intervals &&
                        Array.isArray(columnMeta?.dimension.time_intervals)
                    ) {
                        intervals = validateTimeFrames(
                            columnMeta.dimension.time_intervals,
                        );
                    } else if (
                        dim.isAdditionalDimension &&
                        Array.isArray(overrideTimeIntervals)
                    ) {
                        intervals = validateTimeFrames(overrideTimeIntervals);
                    } else {
                        intervals = getDefaultTimeFrames(dim.type);
                    }

                    return intervals.reduce(
                        (acc, interval) => ({
                            ...acc,
                            [`${dim.name}_${interval.toLowerCase()}`]:
                                convertDimension(
                                    index,
                                    adapterType,
                                    model,
                                    tableLabel,
                                    {
                                        ...column,
                                        ...('isAdditionalDimension' in dim &&
                                        dim.isAdditionalDimension
                                            ? {
                                                  name: dim.name,
                                                  meta: {
                                                      dimension: {
                                                          ...columnMeta.dimension,
                                                          type: dim.type,
                                                          label: dim.label,
                                                          groups: dim.groups,
                                                          sql: dim.sql,
                                                          description:
                                                              dim.description,
                                                      },
                                                  },
                                              }
                                            : {}),
                                    },
                                    undefined,
                                    interval,
                                    startOfWeek,
                                    'isAdditionalDimension' in dim &&
                                        dim.isAdditionalDimension,
                                ),
                        }),
                        {},
                    );
                }
                return {};
            };

            let extraDimensions = {
                ...processIntervalDimension(dimension, undefined),
            };

            extraDimensions = Object.entries(
                columnMeta.additional_dimensions || {},
            ).reduce((acc, [subDimensionName, subDimension]) => {
                const additionalDim = convertDimension(
                    index,
                    adapterType,
                    model,
                    tableLabel,
                    {
                        ...column,
                        name: subDimensionName,
                        meta: {
                            dimension: subDimension,
                        },
                    },
                    undefined,
                    undefined,
                    startOfWeek,
                    true,
                );

                return {
                    ...acc,
                    // When the additional dim is interval AND the base dimension is a interval base then we want to compute all additional dims with the parent intervals otherwise just set the additional dim
                    [subDimensionName]: additionalDim,
                    ...processIntervalDimension(
                        additionalDim,
                        subDimension.time_intervals,
                    ),
                };
            }, extraDimensions);

            const columnMetrics = Object.fromEntries(
                Object.entries(columnMeta.metrics || {}).map(
                    ([name, metric]) => [
                        name,
                        convertColumnMetric({
                            modelName: model.name,
                            dimensionName: dimension.name,
                            dimensionSql: dimension.sql,
                            name,
                            metric,
                            tableLabel,
                            requiredAttributes: dimension.requiredAttributes, // TODO Join dimension required_attributes with metric required_attributes
                            spotlightConfig: {
                                ...spotlightConfig,
                                default_visibility:
                                    meta.spotlight?.visibility ??
                                    spotlightConfig.default_visibility,
                            },
                            modelCategories: meta.spotlight?.categories,
                        }),
                    ],
                ),
            );

            return [
                {
                    ...prevDimensions,
                    [column.name]: dimension,
                    ...extraDimensions,
                },
                { ...prevMetrics, ...columnMetrics },
            ];
        },
        [{}, {}],
    );

    const modelMetrics = Object.fromEntries(
        Object.entries(meta.metrics || {}).map(([name, metric]) => [
            name,
            convertModelMetric({
                modelName: model.name,
                name,
                metric,
                tableLabel,
                spotlightConfig: {
                    ...spotlightConfig,
                    default_visibility:
                        meta.spotlight?.visibility ??
                        spotlightConfig.default_visibility,
                },
                modelCategories: meta.spotlight?.categories,
            }),
        ]),
    );

    const convertedDbtMetrics = Object.fromEntries(
        dbtMetrics.map((metric) => [
            metric.name,
            convertDbtMetricToLightdashMetric(
                metric,
                model.name,
                tableLabel,
                {
                    ...spotlightConfig,
                    default_visibility:
                        meta.spotlight?.visibility ??
                        spotlightConfig.default_visibility,
                },
                meta.spotlight?.categories,
            ),
        ]),
    );

    const allMetrics: Record<string, Metric> = Object.values({
        ...convertedDbtMetrics,
        ...modelMetrics,
        ...metrics,
    }).reduce(
        (acc, metric, index) => ({
            ...acc,
            [metric.name]: { ...metric, index },
        }),
        {},
    );

    const duplicatedNames = Object.keys(allMetrics).filter((metric) =>
        Object.keys(dimensions).includes(metric),
    );
    if (duplicatedNames.length > 0) {
        const message =
            duplicatedNames.length > 1
                ? 'Found multiple metrics and a dimensions with the same name:'
                : 'Found a metric and a dimension with the same name:';
        throw new ParseError(`${message} ${duplicatedNames}`);
    }

    if (!model.relation_name) {
        throw new Error(`Model "${model.name}" has no table relation`);
    }
    const groupDetails: Record<string, GroupType> = {};
    if (meta.group_details) {
        Object.entries(meta.group_details).forEach(([key, data]) => {
            groupDetails[key] = {
                label: data.label,
                description: data.description,
            };
        });
    }

    const sqlTable = meta.sql_from || model.relation_name;
    return {
        name: model.name,
        label: tableLabel,
        database: model.database,
        schema: model.schema,
        sqlTable,
        description: model.description || `${model.name} table`,
        dimensions,
        metrics: allMetrics,
        orderFieldsBy:
            meta.order_fields_by &&
            Object.values(OrderFieldsByStrategy).includes(
                meta.order_fields_by.toUpperCase() as OrderFieldsByStrategy,
            )
                ? (meta.order_fields_by.toUpperCase() as OrderFieldsByStrategy)
                : OrderFieldsByStrategy.LABEL,
        groupLabel: meta.group_label,
        primaryKey: normalizePrimaryKey(meta.primary_key),
        sqlWhere: meta.sql_filter || meta.sql_where,
        requiredFilters: parseModelRequiredFilters({
            requiredFilters: meta.required_filters,
            defaultFilters: meta.default_filters,
        }),
        requiredAttributes: meta.required_attributes,
        groupDetails,
        ...(meta.default_time_dimension
            ? {
                  defaultTimeDimension: {
                      field: meta.default_time_dimension.field,
                      interval: meta.default_time_dimension.interval,
                  },
              }
            : {}),
        ...(meta.ai_hint ? { aiHint: convertToAiHints(meta.ai_hint) } : {}),
    };
};

const translateDbtModelsToTableLineage = (
    models: DbtModelNode[],
): Record<string, Pick<Table, 'lineageGraph'>> => {
    const graph = buildModelGraph(models);
    return models.reduce<Record<string, Pick<Table, 'lineageGraph'>>>(
        (previousValue, currentValue) => ({
            ...previousValue,
            [currentValue.name]: {
                lineageGraph: generateTableLineage(currentValue, graph),
            },
        }),
        {},
    );
};

const modelCanUseMetric = (
    metricName: string,
    modelName: string,
    metrics: DbtMetric[],
): boolean => {
    const metric = metrics.find((m) => m.name === metricName);
    if (!metric) {
        return false;
    }
    const modelRef = metric?.refs?.[0];
    if (modelRef) {
        const modelRefName = isV9MetricRef(modelRef)
            ? modelRef.name
            : modelRef[0];
        if (modelRefName === modelName) {
            return true;
        }
    }

    if (metric.calculation_method === 'derived') {
        const referencedMetrics = (metric.metrics || []).map((m) => m[0]);
        return referencedMetrics.every((m) =>
            modelCanUseMetric(m, modelName, metrics),
        );
    }
    return false;
};

export const convertExplores = async (
    models: DbtModelNode[],
    loadSources: boolean,
    adapterType: SupportedDbtAdapter,
    metrics: DbtMetric[],
    warehouseSqlBuilder: WarehouseSqlBuilder,
    lightdashProjectConfig: LightdashProjectConfig,
): Promise<(Explore | ExploreError)[]> => {
    const tableLineage = translateDbtModelsToTableLineage(models);
    const [tables, exploreErrors] = models.reduce(
        ([accTables, accErrors], model) => {
            // Config block takes priority, then meta block
            const meta = merge({}, model.meta, model.config?.meta);

            // model.config.tags has type string[] | string | undefined - normalise it to string[]
            const configTags =
                typeof model.config?.tags === 'string'
                    ? [model.config.tags]
                    : model.config?.tags;

            // model.config.tags takes priority over model.tags - if config tags is an empty list, we'll use model tags
            const tags =
                configTags && configTags.length > 0 ? configTags : model.tags;

            // If there are any errors compiling the table return an ExploreError
            try {
                // base dimensions and metrics
                // TODO: remove old metrics handling
                const tableMetrics = metrics.filter((metric) =>
                    modelCanUseMetric(metric.name, model.name, metrics),
                );
                const table = convertTable(
                    adapterType,
                    model,
                    tableMetrics,
                    lightdashProjectConfig.spotlight,
                    warehouseSqlBuilder.getStartOfWeek(),
                );

                // add lineage
                const tableWithLineage: Table = {
                    ...table,
                    ...tableLineage[model.name],
                };

                return [[...accTables, tableWithLineage], accErrors];
            } catch (e: unknown) {
                const exploreError: ExploreError = {
                    name: model.name,
                    label: meta.label || friendlyName(model.name),
                    tags,
                    groupLabel: meta.group_label,
                    errors: [
                        {
                            type:
                                e instanceof ParseError
                                    ? InlineErrorType.METADATA_PARSE_ERROR
                                    : InlineErrorType.NO_DIMENSIONS_FOUND,
                            message:
                                e instanceof Error
                                    ? e.message
                                    : `Could not convert dbt model: "${model.name}" in to a Lightdash explore`,
                        },
                    ],
                };
                return [accTables, [...accErrors, exploreError]];
            }
        },
        [[], []] as [Table[], ExploreError[]],
    );
    const tableLookup: Record<string, Table> = tables.reduce(
        (prev, table) => ({ ...prev, [table.name]: table }),
        {},
    );
    const validModels = models.filter(
        (model) => tableLookup[model.name] !== undefined,
    );

    const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder);
    const explores: (Explore | ExploreError)[] = validModels.reduce<
        (Explore | ExploreError)[]
    >((acc, model) => {
        // Config block takes priority, then meta block
        const meta = merge({}, model.meta, model.config?.meta);

        const configTags =
            typeof model.config?.tags === 'string'
                ? [model.config.tags]
                : model.config?.tags;
        const tags =
            configTags && configTags.length > 0 ? configTags : model.tags;

        // Create an array of explores to generate: base explore + any additional explores
        const exploresToCreate = [
            {
                name: model.name,
                label: meta.label || friendlyName(model.name),
                groupLabel: meta.group_label,
                joins: meta?.joins || [],
                description: meta.description,
            },
            ...(meta.explores
                ? Object.entries(meta.explores).map(
                      ([exploreName, exploreConfig]) => ({
                          name: exploreName,
                          label:
                              exploreConfig.label || friendlyName(exploreName),
                          groupLabel:
                              exploreConfig.group_label || meta.group_label,
                          joins: exploreConfig.joins || [],
                          description: exploreConfig.description,
                      }),
                  )
                : []),
        ];

        // Multiple explores can be created from a single model. The base explore + additional explores
        // Properties created from `model` are the same across all explores. e.g. all explores will have the same base table & warehouse
        // Properties created from `exploreToCreate` are specific to each explore. e.g. each explore can have a different name, label & joins
        const newExplores = exploresToCreate.map((exploreToCreate) => {
            try {
                return exploreCompiler.compileExplore({
                    name: exploreToCreate.name,
                    label: exploreToCreate.label,
                    tags: tags || [],
                    baseTable: model.name,
                    groupLabel: exploreToCreate.groupLabel,
                    joinedTables: exploreToCreate.joins.map((join) => ({
                        table: join.join,
                        sqlOn: join.sql_on,
                        type: join.type,
                        alias: join.alias,
                        label: join.label,
                        fields: join.fields,
                        hidden: join.hidden,
                        always: join.always,
                        relationship: join.relationship,
                    })),
                    tables: tableLookup,
                    targetDatabase: adapterType,
                    warehouse: model.config?.snowflake_warehouse,
                    databricksCompute: model.config?.databricks_compute,
                    ymlPath: model.patch_path?.split('://')?.[1],
                    sqlPath: model.path,
                    spotlightConfig: lightdashProjectConfig.spotlight,
                    ...(meta.ai_hint
                        ? { aiHint: convertToAiHints(meta.ai_hint) }
                        : {}),
                    meta: {
                        ...meta,
                        // Override description for additional explores
                        ...(exploreToCreate.description !== undefined
                            ? { description: exploreToCreate.description }
                            : {}),
                    },
                });
            } catch (e: unknown) {
                return {
                    name: exploreToCreate.name,
                    label: exploreToCreate.label,
                    groupLabel: exploreToCreate.groupLabel,
                    errors: [
                        {
                            // TODO improve parsing of error type
                            type:
                                e instanceof ParseError
                                    ? InlineErrorType.METADATA_PARSE_ERROR
                                    : InlineErrorType.NO_DIMENSIONS_FOUND,
                            message:
                                e instanceof Error
                                    ? e.message
                                    : `Could not convert ${
                                          exploreToCreate.name === model.name
                                              ? 'dbt model'
                                              : 'additional explore'
                                      }: "${exploreToCreate.name}" ${
                                          exploreToCreate.name !== model.name
                                              ? `from model "${model.name}"`
                                              : 'is not a valid model'
                                      }`,
                        },
                    ],
                } as ExploreError;
            }
        });

        return [...acc, ...newExplores];
    }, []);

    return [...explores, ...exploreErrors];
};

export const attachTypesToModels = (
    models: DbtModelNode[],
    warehouseCatalog: {
        [database: string]: {
            [schema: string]: {
                [table: string]: { [column: string]: DimensionType };
            };
        };
    },
    throwOnMissingCatalogEntry: boolean = true,
    caseSensitiveMatching: boolean = true,
): DbtModelNode[] => {
    // Check that all models appear in the warehouse
    models.forEach(({ database, schema, name }) => {
        const databaseMatch = Object.keys(warehouseCatalog).find((db) =>
            caseSensitiveMatching
                ? db === database
                : db.toLowerCase() === database.toLowerCase(),
        );
        const schemaMatch =
            databaseMatch &&
            Object.keys(warehouseCatalog[databaseMatch]).find((s) =>
                caseSensitiveMatching
                    ? s === schema
                    : s.toLowerCase() === schema.toLowerCase(),
            );
        const tableMatch =
            databaseMatch &&
            schemaMatch &&
            Object.keys(warehouseCatalog[databaseMatch][schemaMatch]).find(
                (t) =>
                    caseSensitiveMatching
                        ? t === name
                        : t.toLowerCase() === name.toLowerCase(),
            );
        if (!tableMatch && throwOnMissingCatalogEntry) {
            throw new MissingCatalogEntryError(
                `Model "${name}" was expected in your target warehouse at "${database}.${schema}.${name}". Does the table exist in your target data warehouse?`,
                {},
            );
        }
    });

    const getType = (
        { database, schema, name, alias }: DbtModelNode,
        columnName: string,
    ): DimensionType | undefined => {
        const tableName = alias || name;
        const databaseMatch = Object.keys(warehouseCatalog).find((db) =>
            caseSensitiveMatching
                ? db === database
                : db.toLowerCase() === database.toLowerCase(),
        );
        const schemaMatch =
            databaseMatch &&
            Object.keys(warehouseCatalog[databaseMatch]).find((s) =>
                caseSensitiveMatching
                    ? s === schema
                    : s.toLowerCase() === schema.toLowerCase(),
            );
        const tableMatch =
            databaseMatch &&
            schemaMatch &&
            Object.keys(warehouseCatalog[databaseMatch][schemaMatch]).find(
                (t) =>
                    caseSensitiveMatching
                        ? t === tableName
                        : t.toLowerCase() === tableName.toLowerCase(),
            );
        const columnMatch =
            databaseMatch &&
            schemaMatch &&
            tableMatch &&
            Object.keys(
                warehouseCatalog[databaseMatch][schemaMatch][tableMatch],
            ).find((c) =>
                caseSensitiveMatching
                    ? c === columnName
                    : c.toLowerCase() === columnName.toLowerCase(),
            );
        if (databaseMatch && schemaMatch && tableMatch && columnMatch) {
            return warehouseCatalog[databaseMatch][schemaMatch][tableMatch][
                columnMatch
            ];
        }
        if (throwOnMissingCatalogEntry) {
            throw new MissingCatalogEntryError(
                `Column "${columnName}" from model "${tableName}" does not exist.\n "${tableName}.${columnName}" was not found in your target warehouse at ${database}.${schema}.${tableName}. Try rerunning dbt to update your warehouse.`,
                {},
            );
        }
        return undefined;
    };

    // Update the dbt models with type info
    return models.map((model) => ({
        ...model,
        columns: Object.fromEntries(
            Object.entries(model.columns).map(([column_name, column]) => [
                column_name,
                { ...column, data_type: getType(model, column_name) },
            ]),
        ),
    }));
};

export const getSchemaStructureFromDbtModels = (
    dbtModels: DbtModelNode[],
): { database: string; schema: string; table: string }[] =>
    dbtModels.map(({ database, schema, name, alias }) => ({
        database,
        schema,
        table: alias || name,
    }));
