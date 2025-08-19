"use client"

import * as React from "react"
import { addDays, format, startOfMonth, endOfMonth, startOfToday, endOfToday, subDays } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "./ui/separator"

interface DatePickerWithPresetsProps {
  date: DateRange | undefined;
  onDateChange: (date: DateRange | undefined) => void;
  className?: string;
}

export function DatePickerWithPresets({ date, onDateChange, className }: DatePickerWithPresetsProps) {
    
  const handlePreset = (preset: string) => {
    const today = new Date();
    let from, to;

    switch (preset) {
      case 'today':
        from = startOfToday();
        to = endOfToday();
        break;
      case 'yesterday':
        from = subDays(startOfToday(), 1);
        to = subDays(endOfToday(), 1);
        break;
      case 'last7':
        from = subDays(startOfToday(), 6);
        to = endOfToday();
        break;
      case 'thisMonth':
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case 'lastMonth':
        const startOfThisMonth = startOfMonth(today);
        from = startOfMonth(subDays(startOfThisMonth, 1));
        to = endOfMonth(subDays(startOfThisMonth, 1));
        break;
      case 'all':
        from = undefined;
        to = undefined;
        break;
    }
    onDateChange({ from, to });
  };
  
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from && date.from instanceof Date ? (
              date.to && date.to instanceof Date ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Todo o período</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto p-0" align="end">
          <div className="flex flex-col space-y-2 border-r pr-4 py-4">
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('today')}>Hoje</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('yesterday')}>Ontem</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('last7')}>Últimos 7 dias</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('thisMonth')}>Este mês</Button>
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('lastMonth')}>Mês passado</Button>
              <Separator />
              <Button variant="ghost" className="justify-start" onClick={() => handlePreset('all')}>Todo o período</Button>
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={onDateChange}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
