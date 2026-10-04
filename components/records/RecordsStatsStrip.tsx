import React from 'react';
import { StatTile } from '../ui/StatTile';
import { Users, UserCheck, UserPlus, UserX, User } from 'lucide-react';

export interface RecordsStats {
  total: number;
  promoted: number;
  newEnrollment: number;
  dropOut: number;
  male: number;
  female: number;
}

export interface RecordsStatsStripProps {
  stats: RecordsStats;
}

export const RecordsStatsStrip: React.FC<RecordsStatsStripProps> = React.memo(({ stats }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatTile
        label="Total Students"
        value={stats.total.toLocaleString()}
        icon={Users}
        variant="slate"
      />
      <StatTile
        label="Promoted / Active"
        value={stats.promoted.toLocaleString()}
        icon={UserCheck}
        variant="emerald"
      />
      <StatTile
        label="New Enrollment"
        value={stats.newEnrollment.toLocaleString()}
        icon={UserPlus}
        variant="blue"
      />
      <StatTile
        label="Drop Outs"
        value={stats.dropOut.toLocaleString()}
        icon={UserX}
        variant="rose"
      />
      <StatTile
        label="Male Students"
        value={stats.male.toLocaleString()}
        icon={User}
        variant="indigo"
      />
      <StatTile
        label="Female Students"
        value={stats.female.toLocaleString()}
        icon={User}
        variant="purple"
      />
    </div>
  );
});
