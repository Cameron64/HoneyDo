import { useState, useEffect } from 'react';
import { Calendar, Clock, Save, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`,
}));

const DAYS_AHEAD_OPTIONS = [
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '1 week' },
  { value: 10, label: '10 days' },
  { value: 14, label: '2 weeks' },
];

export function ScheduleSettings() {
  const { data: schedule, isLoading } = trpc.recipes.schedule.get.useQuery();
  const utils = trpc.useUtils();

  const [isActive, setIsActive] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [hour, setHour] = useState(9);
  const [daysAhead, setDaysAhead] = useState(7);

  // Initialize state from fetched data
  useEffect(() => {
    if (schedule) {
      setIsActive(schedule.isActive);
      setDayOfWeek(schedule.dayOfWeek);
      setHour(schedule.hour);
      setDaysAhead(schedule.daysAhead);
    }
  }, [schedule]);

  const setSchedule = trpc.recipes.schedule.set.useMutation({
    onSuccess: () => {
      utils.recipes.schedule.get.invalidate();
    },
  });

  const enableSchedule = trpc.recipes.schedule.enable.useMutation({
    onSuccess: () => {
      utils.recipes.schedule.get.invalidate();
    },
  });

  const disableSchedule = trpc.recipes.schedule.disable.useMutation({
    onSuccess: () => {
      utils.recipes.schedule.get.invalidate();
    },
  });

  const triggerNow = trpc.recipes.schedule.triggerNow.useMutation({
    onSuccess: () => {
      utils.recipes.suggestions.getCurrent.invalidate();
    },
  });

  const hasChanges =
    schedule &&
    (dayOfWeek !== schedule.dayOfWeek ||
      hour !== schedule.hour ||
      daysAhead !== schedule.daysAhead);

  const handleSave = () => {
    setSchedule.mutate({
      dayOfWeek,
      hour,
      daysAhead,
    });
  };

  const handleToggleActive = () => {
    if (isActive) {
      disableSchedule.mutate();
    } else {
      enableSchedule.mutate();
    }
    setIsActive(!isActive);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enable/Disable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Automatic Suggestions
          </CardTitle>
          <CardDescription>
            Automatically generate meal suggestions on a weekly schedule
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="schedule-active" className="text-base">
                Enable weekly schedule
              </Label>
              <p className="text-sm text-muted-foreground">
                Get suggestions at the same time each week
              </p>
            </div>
            <Switch
              id="schedule-active"
              checked={isActive}
              onCheckedChange={handleToggleActive}
              disabled={enableSchedule.isPending || disableSchedule.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Schedule Configuration */}
      <Card className={!isActive ? 'opacity-50' : ''}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Schedule Configuration
          </CardTitle>
          <CardDescription>
            When should we generate new suggestions?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Day of week</Label>
              <Select
                value={String(dayOfWeek)}
                onValueChange={(v) => setDayOfWeek(Number(v))}
                disabled={!isActive}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day.value} value={String(day.value)}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Time</Label>
              <Select
                value={String(hour)}
                onValueChange={(v) => setHour(Number(v))}
                disabled={!isActive}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h.value} value={String(h.value)}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Plan ahead for</Label>
            <Select
              value={String(daysAhead)}
              onValueChange={(v) => setDaysAhead(Number(v))}
              disabled={!isActive}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_AHEAD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How many days of meals to suggest each time
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Last Run Info */}
      {schedule?.lastRunAt && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              Last run: {new Date(schedule.lastRunAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={setSchedule.isPending || !isActive}
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-2" />
            {setSchedule.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => triggerNow.mutate()}
          disabled={triggerNow.isPending}
          className={hasChanges ? '' : 'flex-1'}
        >
          <Play className="h-4 w-4 mr-2" />
          {triggerNow.isPending ? 'Running...' : 'Run Now'}
        </Button>
      </div>
    </div>
  );
}
