import {
    AnyType,
    ForbiddenError,
    isUserWithOrg,
    SessionUser,
    UserActivity,
} from '@lightdash/common';

import { subject } from '@casl/ability';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { BaseService } from '../BaseService';

type AnalyticsServiceArguments = {
    analytics: LightdashAnalytics;
    analyticsModel: AnalyticsModel;
};

export class AnalyticsService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly analyticsModel: AnalyticsModel;

    constructor(args: AnalyticsServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.analyticsModel = args.analyticsModel;
    }

    async getDashboardViews(dashboardUuid: string): Promise<number> {
        return this.analyticsModel.countDashboardViews(dashboardUuid);
    }

    async getUserActivity(
        projectUuid: string,
        user: SessionUser,
    ): Promise<UserActivity> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (
            user.ability.cannot(
                'view',
                subject('Analytics', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            event: 'usage_analytics.dashboard_viewed',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: user.organizationUuid,
                dashboardType: 'user_activity',
            },
        });

        return this.analyticsModel.getUserActivity(
            projectUuid,
            user.organizationUuid,
        );
    }
}
