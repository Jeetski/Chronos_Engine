# Cut overdue tasks from today and requeue them to tomorrow
list task status:pending due_date:<=today then cut
tomorrow
today reschedule
today
