import { useEffect, useState } from 'react';

export const TimePicker = ({ onChange, defaultValue }: {
    onChange: (time: { hours: string; minutes: string; ampm: string; }) => void;
    defaultValue: {
        hours: string;
        minutes: string;
        ampm: string;
    };
}) => {
    const [time, setTime] = useState(defaultValue);

    const currentMinutes = parseInt(defaultValue.minutes, 10);
    const minuteOptions = Array.from({ length: 12 }, (_, i) => i * 5);
    if (currentMinutes % 5 !== 0) {
        minuteOptions.push(currentMinutes);
        minuteOptions.sort((a, b) => a - b);
    }

    useEffect(() => {
        onChange(time);
    }, [time]);

    const handleHoursChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setTime({ ...time, hours: e.target.value });
    };

    const handleMinutesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setTime({ ...time, minutes: e.target.value });
    };

    const handleAmPmChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newAmPm = e.target.value;
        let newHours = parseInt(time.hours);
        if (newAmPm === 'pm' && newHours < 12) {
            newHours += 12;
        } else if (newAmPm === 'am' && newHours >= 12) {
            newHours -= 12;
        }
        setTime({ ...time, hours: newHours.toString(), ampm: newAmPm });
    };

    return (
        <div className="container mx-auto">
            <div className="inline-flex border rounded-md shadow-lg p-1 pt-1 bg-gray-100 text-lg text-gray-700">
                <select name="hours" value={time.hours} onChange={handleHoursChange} className="pl-1 outline-none border-0 appearance-none bg-transparent">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                        <option key={hour} value={String(hour)}>{String(hour).padStart(2, '0')}</option>
                    ))}
                </select>
                <span className="pr-2">:</span>
                <select name="minutes" value={time.minutes} onChange={handleMinutesChange} className="outline-none border-0 appearance-none bg-transparent">
                    {minuteOptions.map((minute) => (
                        <option key={minute} value={String(minute).padStart(2, '0')}>{String(minute).padStart(2, '0')}</option>
                    ))}
                </select>
                <select name="ampm" value={time.ampm} onChange={handleAmPmChange} className="pr-1 outline-none border-0 appearance-none bg-transparent">
                    <option value="am">AM</option>
                    <option value="pm">PM</option>
                </select>
            </div>
        </div>


    );
};